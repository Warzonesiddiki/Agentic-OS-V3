pub struct Installer;

impl Installer {
    pub fn new() -> Self { Self }
}

impl Default for Installer {
    fn default() -> Self {
        Self::new()
    }
}
