use regex::Regex;
use std::sync::OnceLock;

struct Pattern {
    label: &'static str,
    regex: Regex,
}

fn patterns() -> &'static [Pattern] {
    static PATTERNS: OnceLock<Vec<Pattern>> = OnceLock::new();
    PATTERNS.get_or_init(|| {
        [
            ("email", r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b"),
            ("phone", r"(?x)\b(?:\+?[1-9]\d{0,2}[ .-]?)?(?:\(?\d{3}\)?[ .-]?)\d{3}[ .-]?\d{4}\b"),
            ("credit_card", r"\b(?:\d[ -]*?){13,19}\b"),
            ("ipv4", r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
        ]
        .into_iter()
        .map(|(label, source)| Pattern {
            label,
            regex: Regex::new(source).expect("built-in PII regex must compile"),
        })
        .collect()
    })
}

pub(crate) fn detect(content: &str) -> Vec<String> {
    patterns()
        .iter()
        .filter(|pattern| pattern.regex.is_match(content))
        .map(|pattern| pattern.label.to_owned())
        .collect()
}

pub(crate) fn redact(content: &str) -> String {
    patterns().iter().fold(content.to_owned(), |text, pattern| {
        pattern
            .regex
            .replace_all(&text, format!("[REDACTED_{}]", pattern.label.to_uppercase()))
            .into_owned()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_and_redacts_pii_without_returning_values() {
        let input = "Contact alice@example.com or +1 415-555-0123";
        assert_eq!(detect(input), vec!["email", "phone"]);
        let output = redact(input);
        assert!(!output.contains("alice@example.com"));
        assert!(output.contains("[REDACTED_EMAIL]"));
    }
}
