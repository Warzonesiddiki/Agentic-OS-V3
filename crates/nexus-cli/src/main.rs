//! NEXUS Agentic OS — TUI CLI (Phase 16).
//!
//! Subcommands:
//!   nexus-cli market list            — list published plugins
//!   nexus-cli market install <slug>  — install a plugin (prints receipt)
//!   nexus-cli agents                 — list running agents
//!   nexus-cli tui                    — interactive Terminal UI
//!   nexus-cli completion <shell>     — print shell completion script

use anyhow::Result;
use clap::{Parser, Subcommand};
use clap_complete::Shell;

mod api;
mod completion;
mod tui;

#[derive(Parser)]
#[command(name = "nexus-cli", version, about = "NEXUS Agentic OS command line client")]
pub struct Cli {
  /// Base URL of the NEXUS API.
  #[arg(long, env = "NEXUS_URL", default_value = "http://localhost:8787")]
  url: String,

  /// API token (bearer).
  #[arg(long, env = "NEXUS_TOKEN")]
  token: Option<String>,

  #[command(subcommand)]
  command: Command,
}

#[derive(Subcommand)]
enum Command {
  /// Marketplace operations.
  Market {
    #[command(subcommand)]
    action: MarketCmd,
  },
  /// List active agents.
  Agents,
  /// Launch the interactive Terminal UI.
  Tui,
  /// Generate shell completion for the given shell.
  Completion { shell: Shell },
}

#[derive(Subcommand)]
enum MarketCmd {
  /// List published plugins.
  List {
    #[arg(long)]
    category: Option<String>,
    #[arg(long)]
    kind: Option<String>,
    #[arg(long, default_value_t = 20)]
    limit: u32,
  },
  /// Install a plugin by slug (returns a verification receipt).
  Install {
    slug: String,
    #[arg(long)]
    tenant: Option<String>,
  },
}

#[tokio::main]
async fn main() -> Result<()> {
  let cli = Cli::parse();
  let client = api::Client::new(cli.url.clone(), cli.token.clone());

  match cli.command {
    Command::Market { action } => match action {
      MarketCmd::List { category, kind, limit } => {
        let items = client.list_plugins(category, kind, limit).await?;
        for p in &items {
          println!("{:<28} {:<10} ★{:.1} ({} installs) — {}", p.slug, p.kind, p.avg_rating, p.install_count, p.name);
        }
        println!("— {} plugin(s) —", items.len());
      }
      MarketCmd::Install { slug, tenant } => {
        let receipt = client.install_plugin(&slug, tenant).await?;
        println!("installed {slug}");
        println!("receipt: {receipt}");
      }
    },
    Command::Agents => {
      let agents = client.list_agents().await?;
      for a in &agents {
        println!("{:<24} {}", a.id, a.status);
      }
    }
    Command::Tui => {
      tui::run(client).await?;
    }
    Command::Completion { shell } => {
      completion::print(shell);
    }
  }
  Ok(())
}
