use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const K1: f64 = 1.2;
const B: f64 = 0.75;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexedChunk {
    pub path: String,
    pub start_line: usize,
    pub end_line: usize,
    pub text: String,
    pub term_freqs: HashMap<String, u32>,
    pub length: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Bm25Index {
    pub chunks: Vec<IndexedChunk>,
    pub inverted: HashMap<String, Vec<(usize, u32)>>,
    pub doc_freq: HashMap<String, usize>,
    pub avg_doc_len: f64,
}

impl Bm25Index {
    #[allow(dead_code)]
    pub fn clear(&mut self) {
        self.chunks.clear();
        self.inverted.clear();
        self.doc_freq.clear();
        self.avg_doc_len = 0.0;
    }

    pub fn add_chunk(&mut self, chunk: IndexedChunk) {
        let doc_id = self.chunks.len();
        let mut seen_terms = std::collections::HashSet::new();
        for (term, freq) in &chunk.term_freqs {
            self.inverted
                .entry(term.clone())
                .or_default()
                .push((doc_id, *freq));
            if seen_terms.insert(term.clone()) {
                *self.doc_freq.entry(term.clone()).or_insert(0) += 1;
            }
        }
        self.chunks.push(chunk);
        self.recompute_avg_len();
    }

    fn recompute_avg_len(&mut self) {
        if self.chunks.is_empty() {
            self.avg_doc_len = 0.0;
            return;
        }
        let total: usize = self.chunks.iter().map(|c| c.length).sum();
        self.avg_doc_len = total as f64 / self.chunks.len() as f64;
    }

    pub fn remove_paths(&mut self, paths: &std::collections::HashSet<String>) {
        if paths.is_empty() {
            return;
        }
        let kept: Vec<IndexedChunk> = self
            .chunks
            .drain(..)
            .filter(|c| !paths.contains(&c.path))
            .collect();
        self.chunks = kept;
        self.rebuild_inverted();
    }

    pub fn rebuild_inverted(&mut self) {
        self.inverted.clear();
        self.doc_freq.clear();
        let old = std::mem::take(&mut self.chunks);
        self.chunks.clear();
        for chunk in old {
            self.add_chunk(chunk);
        }
    }

    pub fn search(&self, query: &str, top_k: usize) -> Vec<SearchHit> {
        let terms = tokenize(query);
        if terms.is_empty() || self.chunks.is_empty() {
            return vec![];
        }

        let n = self.chunks.len() as f64;
        let mut scores: HashMap<usize, f64> = HashMap::new();

        for term in terms {
            let Some(postings) = self.inverted.get(&term) else {
                continue;
            };
            let df = self.doc_freq.get(&term).copied().unwrap_or(0) as f64;
            let idf = ((n - df + 0.5) / (df + 0.5) + 1.0).ln();

            for (doc_id, tf) in postings {
                let chunk = &self.chunks[*doc_id];
                let tf = *tf as f64;
                let dl = chunk.length as f64;
                let denom = tf + K1 * (1.0 - B + B * dl / self.avg_doc_len.max(1.0));
                let score = idf * (tf * (K1 + 1.0)) / denom;
                *scores.entry(*doc_id).or_insert(0.0) += score;
            }
        }

        let mut hits: Vec<SearchHit> = scores
            .into_iter()
            .map(|(doc_id, score)| {
                let c = &self.chunks[doc_id];
                SearchHit {
                    file: c.path.clone(),
                    start_line: c.start_line,
                    end_line: c.end_line,
                    excerpt: truncate_excerpt(&c.text, 400),
                    score,
                }
            })
            .collect();

        hits.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        hits.truncate(top_k);
        hits
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchHit {
    pub file: String,
    pub start_line: usize,
    pub end_line: usize,
    pub excerpt: String,
    pub score: f64,
}

pub fn tokenize(text: &str) -> Vec<String> {
    let mut terms = Vec::new();
    let mut current = String::new();
    for ch in text.chars() {
        if ch.is_alphanumeric() || ch == '_' {
            current.push(ch.to_ascii_lowercase());
        } else if !current.is_empty() {
            if current.len() >= 2 {
                terms.push(std::mem::take(&mut current));
            } else {
                current.clear();
            }
        }
    }
    if current.len() >= 2 {
        terms.push(current);
    }
    terms
}

pub fn build_indexed_chunk(path: &str, start_line: usize, end_line: usize, text: &str) -> IndexedChunk {
    let terms = tokenize(text);
    let mut term_freqs: HashMap<String, u32> = HashMap::new();
    for t in terms {
        *term_freqs.entry(t).or_insert(0) += 1;
    }
    IndexedChunk {
        path: path.to_string(),
        start_line,
        end_line,
        text: text.to_string(),
        length: term_freqs.values().sum::<u32>() as usize,
        term_freqs,
    }
}

fn truncate_excerpt(text: &str, max_chars: usize) -> String {
    let char_count = text.chars().count();
    if char_count <= max_chars {
        return text.to_string();
    }
    let truncated: String = text.chars().take(max_chars).collect();
    format!("{truncated}…")
}
