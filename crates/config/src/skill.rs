use serde::Deserialize;

/// Configuration for the skill subsystem.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct SkillManagerConfig {
    /// Directories to scan for skill definitions.
    #[serde(default = "default_skill_dirs")]
    pub skill_dirs: Vec<String>,

    /// Glob patterns for skill files (e.g. "*.md", "SKILL.md").
    #[serde(default = "default_skill_patterns")]
    pub skill_patterns: Vec<String>,

    /// Whether to load skills lazily on first use.
    #[serde(default)]
    pub lazy_load: bool,

    /// Maximum number of skills to keep in the hot cache.
    #[serde(default = "default_cache_size")]
    pub cache_size: usize,

    /// Interval (seconds) between directory rescans.
    #[serde(default = "default_rescan_interval")]
    pub rescan_interval_secs: u64,
}

fn default_skill_dirs() -> Vec<String> {
    vec!["skills".into(), "~/.hermes/skills".into()]
}

fn default_skill_patterns() -> Vec<String> {
    vec!["*.md".into()]
}

fn default_cache_size() -> usize {
    64
}

fn default_rescan_interval() -> u64 {
    300
}
