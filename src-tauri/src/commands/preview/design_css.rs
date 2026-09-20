use std::collections::BTreeMap;

use lightningcss::properties::{Property, PropertyId};
use lightningcss::stylesheet::{ParserOptions, PrinterOptions, StyleAttribute};

fn parser_options<'i>() -> ParserOptions<'i> {
    ParserOptions {
        error_recovery: true,
        ..ParserOptions::default()
    }
}

fn printer_options() -> PrinterOptions<'static> {
    PrinterOptions {
        minify: false,
        ..PrinterOptions::default()
    }
}

fn decl_key(property: &str) -> String {
    if property.starts_with("--") {
        property.to_string()
    } else {
        property.to_ascii_lowercase()
    }
}

fn fallback_split(existing: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let mut start = 0;
    let mut depth = 0i32;
    let bytes = existing.as_bytes();
    for (index, byte) in bytes.iter().copied().enumerate() {
        match byte {
            b'(' => depth += 1,
            b')' => depth = (depth - 1).max(0),
            b';' if depth == 0 => {
                push_raw_decl(&mut out, existing[start..index].trim());
                start = index + 1;
            }
            _ => {}
        }
    }
    push_raw_decl(&mut out, existing[start..].trim());
    out
}

fn push_raw_decl(out: &mut Vec<(String, String)>, part: &str) {
    if part.is_empty() {
        return;
    }
    let Some((name, value)) = part.split_once(':') else {
        return;
    };
    out.push((decl_key(name.trim()), value.trim().to_string()));
}

fn existing_decls(existing: &str) -> Vec<(String, String)> {
    let trimmed = existing.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    if let Ok(attr) = StyleAttribute::parse(trimmed, parser_options()) {
        let mut out = Vec::new();
        for prop in attr
            .declarations
            .declarations
            .iter()
            .chain(attr.declarations.important_declarations.iter())
        {
            let name = decl_key(prop.property_id().name());
            if let Ok(value) = prop.value_to_css_string(printer_options()) {
                out.push((name, value));
            }
        }
        if !out.is_empty() {
            return out;
        }
    }
    fallback_split(trimmed)
}

/// Keep the authored spelling. Lightning CSS validates known properties so we
/// can still merge `url("data:...;...")` and comma-separated values safely.
pub fn normalize_css_value(property: &str, value: &str) -> String {
    let value = value.trim();
    if value.is_empty() || property.starts_with("--") || value.contains("var(") {
        return value.to_string();
    }
    let _ = Property::parse_string(PropertyId::from(property.trim()), value, parser_options());
    value.to_string()
}

/// Merge updates into an inline `style=""` declaration list using a real CSS parser.
pub fn merge_css_declarations(existing: &str, updates: &BTreeMap<String, String>) -> String {
    let mut order: Vec<String> = Vec::new();
    let mut values = BTreeMap::<String, String>::new();
    for (name, value) in existing_decls(existing) {
        if !values.contains_key(&name) {
            order.push(name.clone());
        }
        values.insert(name, value);
    }
    for (property, value) in updates {
        let key = decl_key(property);
        if !values.contains_key(&key) {
            order.push(key.clone());
        }
        values.insert(key, normalize_css_value(property, value));
    }
    order
        .into_iter()
        .filter_map(|name| {
            values
                .get(&name)
                .map(|value| format!("{name}: {value}"))
        })
        .collect::<Vec<_>>()
        .join("; ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merges_over_comma_separated_shadows() {
        let mut styles = BTreeMap::new();
        styles.insert("opacity".into(), "0.8".into());
        let out = merge_css_declarations(
            "box-shadow: 0 1px 2px red, 0 2px 8px blue; color: black",
            &styles,
        );
        assert!(out.contains("box-shadow:"));
        assert!(out.contains("1px") && out.contains("8px"));
        assert!(out.contains("opacity: 0.8"));
        assert!(out.contains("color:"));
    }

    #[test]
    fn keeps_semicolons_inside_css_functions() {
        let mut styles = BTreeMap::new();
        styles.insert("padding".into(), "8px".into());
        let out = merge_css_declarations(
            r#"background-image: url("data:image/svg+xml;utf8,<svg></svg>")"#,
            &styles,
        );
        assert!(out.contains("background-image:"));
        assert!(out.contains("svg"));
        assert!(out.contains("padding: 8px"));
    }

    #[test]
    fn keeps_css_variables() {
        let mut styles = BTreeMap::new();
        styles.insert("color".into(), "var(--text)".into());
        assert_eq!(merge_css_declarations("", &styles), "color: var(--text)");
    }

    #[test]
    fn keeps_authored_values() {
        assert_eq!(normalize_css_value("display", "flex"), "flex");
        assert_eq!(normalize_css_value("opacity", "0.80"), "0.80");
    }
}
