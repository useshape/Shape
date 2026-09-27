//! Microphone permission for WebView2, and Windows dictation.
//! Chromium's web speech API fails inside WebView2 (`network`), so dictation
//! uses the system recognizer instead.

#[cfg(windows)]
pub fn allow_microphone(app: &tauri::AppHandle) {
    use tauri::Manager;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_PERMISSION_KIND_MICROPHONE, COREWEBVIEW2_PERMISSION_STATE_ALLOW,
    };
    use webview2_com::PermissionRequestedEventHandler;

    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.with_webview(|webview| unsafe {
        let Ok(core) = webview.controller().CoreWebView2() else {
            return;
        };
        let handler = PermissionRequestedEventHandler::create(Box::new(|_, args| {
            let Some(args) = args else {
                return Ok(());
            };
            let mut kind = Default::default();
            args.PermissionKind(&mut kind)?;
            if kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE {
                args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
            }
            Ok(())
        }));
        let mut token = 0i64;
        let _ = core.add_PermissionRequested(&handler, &mut token);
        // The webview holds the callback for the process lifetime.
        std::mem::forget(handler);
    });
}

#[cfg(not(windows))]
pub fn allow_microphone(_app: &tauri::AppHandle) {}

static DICTATION_STOP: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static DICTATION_GEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
struct DictationProc {
    child: std::process::Child,
    stdin: Option<std::process::ChildStdin>,
}

static DICTATION: std::sync::Mutex<Option<DictationProc>> = std::sync::Mutex::new(None);

const DICTATION_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Speech
  $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine
  $engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
  while ($true) {
    $path = [Console]::In.ReadLine()
    if ($null -eq $path) { break }
    $path = $path.Trim()
    if ($path -eq 'STOP' -or $path -eq '') { break }
    try {
      $engine.SetInputToWaveFile($path)
      $result = $engine.Recognize()
      $engine.SetInputToNull()
      if ($null -ne $result -and -not [string]::IsNullOrWhiteSpace($result.Text)) {
        [Console]::Out.WriteLine($result.Text.Trim())
        [Console]::Out.Flush()
      }
    } catch {
      [Console]::Out.WriteLine('ERR ' + $_.Exception.Message)
      [Console]::Out.Flush()
    } finally {
      Remove-Item -LiteralPath $path -ErrorAction SilentlyContinue
    }
  }
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
"#;

fn encoded_powershell(script: &str) -> String {
    let bytes: Vec<u8> = script.encode_utf16().flat_map(|unit| unit.to_le_bytes()).collect();
    base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes)
}

fn take_proc() -> Option<DictationProc> {
    DICTATION.lock().unwrap_or_else(|p| p.into_inner()).take()
}

fn kill_child(child: &mut std::process::Child) {
    let pid = child.id();
    let _ = child.kill();
    let _ = child.wait();
    #[cfg(windows)]
    {
        use std::process::{Command, Stdio};
        let _ = Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    #[cfg(not(windows))]
    {
        let _ = pid;
    }
}

/// Stop dictation if it is running.
#[tauri::command]
pub fn dictation_stop() {
    DICTATION_STOP.store(true, std::sync::atomic::Ordering::SeqCst);
    if let Some(mut proc) = take_proc() {
        if let Some(mut stdin) = proc.stdin.take() {
            use std::io::Write;
            let _ = writeln!(stdin, "STOP");
            let _ = stdin.flush();
        }
        kill_child(&mut proc.child);
    }
}

/// Recognize one WAV the page recorded from the microphone.
#[tauri::command]
pub fn dictation_push(wav: Vec<u8>) -> Result<(), String> {
    if wav.len() < 64 {
        return Ok(());
    }
    let path = std::env::temp_dir().join(format!(
        "shape-dict-{}.wav",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    ));
    std::fs::write(&path, &wav).map_err(|e| format!("Could not store dictation audio ({e})."))?;
    let mut guard = DICTATION.lock().unwrap_or_else(|p| p.into_inner());
    let Some(proc) = guard.as_mut() else {
        let _ = std::fs::remove_file(&path);
        return Err("Dictation is not running.".into());
    };
    let Some(stdin) = proc.stdin.as_mut() else {
        let _ = std::fs::remove_file(&path);
        return Err("Dictation is not running.".into());
    };
    use std::io::Write;
    writeln!(stdin, "{}", path.display()).map_err(|e| e.to_string())?;
    stdin.flush().map_err(|e| e.to_string())?;
    Ok(())
}

/// Start the system dictation engine. Recognized phrases are emitted as `dictation-text`.
#[tauri::command]
pub fn dictation_start(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(not(windows))]
    {
        let _ = app;
        return Err("Speech to text isn't available in this window.".into());
    }
    #[cfg(windows)]
    {
        use std::io::{BufRead, BufReader, Read};
        use std::process::{Command, Stdio};
        use tauri::Emitter;

        let gen = DICTATION_GEN.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
        dictation_stop();
        DICTATION_STOP.store(false, std::sync::atomic::Ordering::SeqCst);
        let mut cmd = Command::new("powershell");
        cmd.args([
            "-NoProfile",
            "-NonInteractive",
            "-EncodedCommand",
            &encoded_powershell(DICTATION_SCRIPT),
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        let mut child = cmd.spawn().map_err(|e| format!("Dictation couldn't start ({e})."))?;
        let stdout = child.stdout.take().ok_or_else(|| "Dictation has no output.".to_string())?;
        let stderr = child.stderr.take();
        let stdin = child.stdin.take();
        {
            let mut guard = DICTATION.lock().unwrap_or_else(|p| p.into_inner());
            *guard = Some(DictationProc { child, stdin });
        }
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if DICTATION_STOP.load(std::sync::atomic::Ordering::SeqCst)
                    || DICTATION_GEN.load(std::sync::atomic::Ordering::SeqCst) != gen
                {
                    break;
                }
                let Ok(line) = line else { break };
                let text = line.trim();
                if text.is_empty() {
                    continue;
                }
                let _ = app.emit("dictation-text", text.to_string());
            }
            if DICTATION_STOP.load(std::sync::atomic::Ordering::SeqCst)
                || DICTATION_GEN.load(std::sync::atomic::Ordering::SeqCst) != gen
            {
                return;
            }
            let mut err = String::new();
            if let Some(mut stderr) = stderr {
                let _ = stderr.read_to_string(&mut err);
            }
            let message = err.trim();
            let message = if message.is_empty() {
                "Dictation couldn't start. Turn on speech recognition in Windows."
            } else {
                message
            };
            let _ = app.emit("dictation-error", message.to_string());
        });
        Ok(())
    }
}
