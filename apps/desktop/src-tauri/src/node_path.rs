use std::path::{Path, PathBuf};

// Tauri's Windows resource directory can be a verbatim path. Node 22's
// entry-point resolver rejects that spelling with EISDIR lstat 'C:'. Keep
// the filesystem path intact in Rust and adapt only the Node boundary.
fn normalize_windows_path(path: &str) -> String {
  if let Some(unc) = path.strip_prefix(r"\\?\UNC\") {
    format!(r"\\{unc}")
  } else if let Some(drive) = path.strip_prefix(r"\\?\") {
    drive.to_string()
  } else {
    path.to_string()
  }
}

pub fn path_for_node(path: &Path) -> PathBuf {
  if cfg!(windows) {
    PathBuf::from(normalize_windows_path(&path.to_string_lossy()))
  } else {
    path.to_path_buf()
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn node_paths_preserve_spaces_and_unc_shares_without_verbatim_prefixes() {
    assert_eq!(normalize_windows_path(r"\\?\C:\Users\Example User\game\launch.mjs"), r"C:\Users\Example User\game\launch.mjs");
    assert_eq!(normalize_windows_path(r"\\?\UNC\server\share\game\launch.mjs"), r"\\server\share\game\launch.mjs");
    assert_eq!(normalize_windows_path(r"C:\Games\launch.mjs"), r"C:\Games\launch.mjs");
    assert_eq!(normalize_windows_path("/opt/game/launch.mjs"), "/opt/game/launch.mjs");
  }

  #[cfg(windows)]
  #[test]
  fn bundled_node_runs_a_script_from_a_long_canonical_windows_path() {
    let mut dir = std::env::temp_dir().join(format!("ahd-node-path-{}", std::process::id()));
    for _ in 0..6 { dir = dir.join("a directory with spaces and a long name 12345"); }
    std::fs::create_dir_all(&dir).unwrap();
    let script = dir.join("probe.mjs");
    std::fs::write(&script, "console.log('ahd-node-path-ok')").unwrap();
    let canonical = script.canonicalize().unwrap();
    assert!(canonical.to_string_lossy().len() > 260);
    let node = Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries/ahd-node-x86_64-pc-windows-msvc.exe");
    let output = std::process::Command::new(node).arg(path_for_node(&canonical)).output().unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    assert_eq!(String::from_utf8_lossy(&output.stdout).trim(), "ahd-node-path-ok");
    std::fs::remove_file(script).unwrap();
    std::fs::remove_dir_all(std::env::temp_dir().join(format!("ahd-node-path-{}", std::process::id()))).unwrap();
  }
}
