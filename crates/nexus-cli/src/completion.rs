//! Shell completion generation (clap_complete).

use clap::CommandFactory;
use clap_complete::Shell;
use std::io;

use crate::Cli;

pub fn print(shell: Shell) {
  let mut cmd = Cli::command();
  let name = cmd.get_name().to_string();
  clap_complete::generate(shell, &mut cmd, name, &mut io::stdout());
}
