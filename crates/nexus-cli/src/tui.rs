//! Interactive Terminal UI (ratatui + crossterm).

use anyhow::Result;
use crossterm::event::{self, Event, KeyCode};
use ratatui::{backend::CrosstermBackend, Terminal};
use std::io;
use std::time::Duration;

use crate::api::{Client, Plugin};

pub async fn run(client: Client) -> Result<()> {
  let plugins: Vec<Plugin> = client.list_plugins(None, None, 50).await.unwrap_or_default();
  let mut selected = 0usize;

  let backend = CrosstermBackend::new(io::stdout());
  let mut term = Terminal::new(backend)?;
  crossterm::terminal::enable_raw_mode()?;
  crossterm::execute!(io::stdout(), crossterm::terminal::EnterAlternateScreen)?;

  let result = loop {
    term.draw(|f| {
      let size = f.area();
      let items: Vec<ratatui::widgets::ListItem> = plugins
        .iter()
        .enumerate()
        .map(|(i, p)| {
          let marker = if i == selected { "▶ " } else { "  " };
          ratatui::widgets::ListItem::new(format!("{}{} — {}", marker, p.slug, p.name))
        })
        .collect();
      let list = ratatui::widgets::List::new(items).block(
        ratatui::widgets::Block::default()
          .borders(ratatui::widgets::Borders::ALL)
          .title(" NEXUS Marketplace (↑/↓ navigate, Enter install, q quit) "),
      );
      f.render_widget(list, size);
    })?;

    if event::poll(Duration::from_millis(200))? {
      if let Event::Key(key) = event::read()? {
        match key.code {
          KeyCode::Char('q') => break Ok(()),
          KeyCode::Down => selected = (selected + 1).min(plugins.len().saturating_sub(1)),
          KeyCode::Up => selected = selected.saturating_sub(1),
          KeyCode::Enter => {
            if let Some(p) = plugins.get(selected) {
              let _ = client.install_plugin(&p.slug, None).await;
            }
          }
          _ => {}
        }
      }
    }
  };

  crossterm::execute!(io::stdout(), crossterm::terminal::LeaveAlternateScreen)?;
  crossterm::terminal::disable_raw_mode()?;
  result
}
