//! nexus-search — NEXUS 2.0 high-performance search index (Phase 15.13).
//!
//! This is a minimal, build-clean stub so `cargo check --workspace` passes before the
//! full napi-rs bindings land. The real implementation will expose an inverted index with
//! prefix/semantic fusion and a Node bridge (`@agentic-os/nexus-search`).
//!
//! The crate compiles standalone (no external deps) and provides a tiny, tested primitive
//! so the workspace stays green while the performance subsystem is wired.

/// A single scored search hit.
#[derive(Debug, Clone, PartialEq)]
pub struct Hit {
    pub key: String,
    pub score: f64,
}

/// Inverted-index primitive over in-memory terms.
#[derive(Default)]
pub struct SearchIndex {
    terms: std::collections::HashMap<String, Vec<String>>,
}

impl SearchIndex {
    /// Insert a document `key` indexed by its whitespace-split terms.
    pub fn insert(&mut self, key: &str, text: &str) {
        for term in text.split_whitespace() {
            let term = term.to_lowercase();
            self.terms.entry(term).or_default().push(key.to_string());
        }
    }

    /// Return documents matching any of the query terms, scored by hit count.
    pub fn search(&self, query: &str) -> Vec<Hit> {
        let mut scores: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
        for term in query.split_whitespace() {
            let term = term.to_lowercase();
            if let Some(keys) = self.terms.get(&term) {
                for k in keys {
                    *scores.entry(k.clone()).or_insert(0.0) += 1.0;
                }
            }
        }
        let mut hits: Vec<Hit> = scores
            .into_iter()
            .map(|(key, score)| Hit { key, score })
            .collect();
        hits.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        hits
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inserts_and_searches() {
        let mut idx = SearchIndex::default();
        idx.insert("doc1", "rust performance cache");
        idx.insert("doc2", "rust safety kernel");
        let hits = idx.search("rust");
        assert_eq!(hits.len(), 2);
        // both score 1.0 for the single shared term
        assert!(hits.iter().all(|h| h.score == 1.0));
    }

    #[test]
    fn ranks_by_score() {
        let mut idx = SearchIndex::default();
        idx.insert("a", "cache cache cache");
        idx.insert("b", "cache");
        let hits = idx.search("cache");
        assert_eq!(hits[0].key, "a");
        assert_eq!(hits[0].score, 3.0);
    }
}
