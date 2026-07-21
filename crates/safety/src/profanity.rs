use regex::RegexSet;
use std::sync::OnceLock;

fn patterns() -> &'static RegexSet {
    static PATTERNS: OnceLock<RegexSet> = OnceLock::new();
    PATTERNS.get_or_init(|| {
        // Deliberately small, auditable baseline. Deployments can layer a locale-
        // specific classifier without changing the core safety contract.
        RegexSet::new([
            r"(?i)\b(?:fuck|fucks|fucking|fucked)\b",
            r"(?i)\b(?:shit|shits|shitty|bullshit)\b",
        ])
            .expect("built-in profanity regexes must compile")
    })
}

pub(crate) fn contains_profanity(content: &str) -> bool {
    patterns().is_match(content)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_words_not_substrings() {
        assert!(contains_profanity("what the fuck"));
        assert!(!contains_profanity("a shiitake mushroom"));
    }
}
