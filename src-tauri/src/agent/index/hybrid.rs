//! Hybrid retrieval: BM25 + ripgrep + server embeddings → RRF merge → rerank.

use super::bm25::{Bm25Index, SearchHit};
use super::embeddings::{Embedder, EmbeddingStore, RemoteSearchHit};
use crate::agent::search::rg::{rg_search, RgHit};
use std::collections::HashMap;

pub const RRF_K: f64 = 60.0;
pub const N_RETRIEVE: usize = 50;
pub const N_FINAL: usize = 10;

#[derive(Debug, Clone)]
pub struct RetrievalHit {
    pub file: String,
    pub start_line: usize,
    pub end_line: usize,
    pub excerpt: String,
    pub score: f64,
    #[allow(dead_code)]
    pub sources: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct HybridOptions {
    pub top_k: usize,
    pub n_retrieve: usize,
    pub embeddings_enabled: bool,
    pub boost_paths: Vec<String>,
}

impl Default for HybridOptions {
    fn default() -> Self {
        Self {
            top_k: N_FINAL,
            n_retrieve: N_RETRIEVE,
            embeddings_enabled: true,
            boost_paths: vec![],
        }
    }
}

pub fn hybrid_search(
    project_path: &str,
    query: &str,
    index: &Bm25Index,
    embeddings: &EmbeddingStore,
    remote: &Embedder,
    opts: &HybridOptions,
) -> Vec<RetrievalHit> {
    let n = opts.n_retrieve.max(1);

    let bm25_hits = index.search(query, n);
    let rg_hits = rg_search(project_path, query, n);

    let emb_hits: Vec<RemoteSearchHit> =
        if opts.embeddings_enabled && embeddings.enabled && remote.is_available() {
            remote.search(query, n).unwrap_or_default()
        } else {
            vec![]
        };

    let merged = rrf_merge(&bm25_hits, &rg_hits, &emb_hits, index);
    rerank(merged, &bm25_hits, &opts.boost_paths, opts.top_k)
}

fn rrf_merge(
    bm25: &[SearchHit],
    rg: &[RgHit],
    emb: &[RemoteSearchHit],
    index: &Bm25Index,
) -> Vec<(String, usize, usize, f64, String, Vec<String>)> {
    let mut map: HashMap<String, (usize, f64, String, Vec<String>)> = HashMap::new();

    for (rank, hit) in bm25.iter().enumerate() {
        let key = format!("{}:{}", hit.file, hit.start_line);
        let rrf = 1.0 / (RRF_K + rank as f64 + 1.0);
        let entry = map.entry(key).or_insert((
            hit.end_line,
            0.0,
            hit.excerpt.clone(),
            vec![],
        ));
        entry.1 += rrf;
        entry.0 = hit.end_line;
        entry.2 = hit.excerpt.clone();
        entry.3.push("bm25".to_string());
    }

    for (rank, hit) in rg.iter().enumerate() {
        let key = format!("{}:{}", hit.file, hit.line);
        let rrf = 1.0 / (RRF_K + rank as f64 + 1.0);
        let excerpt = hit.excerpt.clone();
        let entry = map.entry(key).or_insert((hit.line, 0.0, excerpt.clone(), vec![]));
        entry.1 += rrf;
        entry.3.push("rg".to_string());
        if entry.2.is_empty() {
            entry.2 = excerpt;
        }
    }

    for (rank, hit) in emb.iter().enumerate() {
        let key = format!("{}:{}", hit.file, hit.start_line);
        let rrf = 1.0 / (RRF_K + rank as f64 + 1.0);
        let excerpt = index
            .chunks
            .iter()
            .find(|c| c.path == hit.file && c.start_line == hit.start_line)
            .map(|c| truncate_excerpt(&c.text, 400))
            .unwrap_or_default();
        let entry = map.entry(key).or_insert((
            hit.end_line,
            0.0,
            excerpt.clone(),
            vec![],
        ));
        entry.1 += rrf;
        entry.0 = hit.end_line;
        if entry.2.is_empty() {
            entry.2 = excerpt;
        }
        entry.3.push("emb".to_string());
        let _ = rank;
    }

    map.into_iter()
        .map(|(k, (end, score, excerpt, sources))| {
            let parts: Vec<&str> = k.splitn(2, ':').collect();
            let file = parts.first().unwrap_or(&"").to_string();
            let start_line = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(1);
            (file, start_line, end, score, excerpt, sources)
        })
        .collect()
}

fn rerank(
    merged: Vec<(String, usize, usize, f64, String, Vec<String>)>,
    bm25_hits: &[SearchHit],
    boost_paths: &[String],
    top_k: usize,
) -> Vec<RetrievalHit> {
    let bm25_map: HashMap<String, f64> = bm25_hits
        .iter()
        .map(|h| (format!("{}:{}", h.file, h.start_line), h.score))
        .collect();

    let mut hits: Vec<RetrievalHit> = merged
        .into_iter()
        .map(|(file, start, end, rrf, excerpt, sources)| {
            let key = format!("{file}:{start}");
            let bm25_boost = bm25_map.get(&key).copied().unwrap_or(0.0) * 0.1;
            let path_boost = if boost_paths.iter().any(|p| file.contains(p)) {
                0.15
            } else {
                0.0
            };
            RetrievalHit {
                file,
                start_line: start,
                end_line: end,
                excerpt,
                score: rrf + bm25_boost + path_boost,
                sources,
            }
        })
        .collect();

    hits.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    hits.truncate(top_k);
    hits
}

fn truncate_excerpt(text: &str, max_chars: usize) -> String {
    let char_count = text.chars().count();
    if char_count <= max_chars {
        return text.to_string();
    }
    let truncated: String = text.chars().take(max_chars).collect();
    format!("{truncated}…")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rrf_boosts_overlapping_ranks() {
        let bm25 = vec![SearchHit {
            file: "a.rs".to_string(),
            start_line: 1,
            end_line: 10,
            excerpt: "fn main".to_string(),
            score: 5.0,
        }];
        let rg = vec![RgHit {
            file: "a.rs".to_string(),
            line: 1,
            excerpt: "fn main".to_string(),
        }];
        let index = Bm25Index::default();
        let merged = rrf_merge(&bm25, &rg, &[], &index);
        assert_eq!(merged.len(), 1);
        let (_, _, _, score, _, sources) = &merged[0];
        assert!(*score > 1.0 / (RRF_K + 1.0));
        assert!(sources.contains(&"bm25".to_string()));
        assert!(sources.contains(&"rg".to_string()));
    }
}
