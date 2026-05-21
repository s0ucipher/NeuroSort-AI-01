import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

from organizer import organize_folder, organize_sources, save_organized_copy


load_dotenv()

FRONTEND_DIST = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))

app = Flask(__name__, static_folder=FRONTEND_DIST, static_url_path="")
CORS(app)


def is_local_env():
    # If the user explicitly sets the env to web/cloud, respect it
    if os.environ.get("NEUROSORT_ENV") == "web":
        return False
    # If running in Vercel or other cloud environments, return False
    if os.environ.get("VERCEL") or os.environ.get("NOW_BUILDER"):
        return False
    return True


@app.route("/config", methods=["GET"])
@app.route("/api/config", methods=["GET"])
def config():
    mode = "local" if is_local_env() else "web"
    return jsonify({"envMode": mode})


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "app": "NeuroSort AI"})


def _normalize_selected_path(path):
    normalized = path.strip()
    if normalized != "/":
        normalized = normalized.rstrip("/")
    return normalized


def _run_macos_dialog(script):
    result = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True,
        text=True,
        timeout=180,
        check=False,
    )

    if result.returncode != 0:
        raise ValueError("Selection cancelled.")

    return [_normalize_selected_path(line) for line in result.stdout.splitlines() if line.strip()]


def _select_files_with_macos_dialog():
    script = """
set selectedItems to choose file with prompt "Select files for NeuroSort AI" with multiple selections allowed
set output to ""
repeat with selectedItem in selectedItems
    set output to output & POSIX path of selectedItem & linefeed
end repeat
return output
"""
    return _run_macos_dialog(script)


def _select_folders_with_macos_dialog():
    script = """
set selectedItems to choose folder with prompt "Select folders for NeuroSort AI" with multiple selections allowed
set output to ""
repeat with selectedItem in selectedItems
    set output to output & POSIX path of selectedItem & linefeed
end repeat
return output
"""
    return _run_macos_dialog(script)


def _select_destination_with_macos_dialog():
    script = 'POSIX path of (choose folder with prompt "Select an output folder for NeuroSort AI")'
    return _run_macos_dialog(script)[0]


def _select_files_with_tkinter():
    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    selected_paths = filedialog.askopenfilenames(title="Select files for NeuroSort AI")
    root.destroy()

    if not selected_paths:
        raise ValueError("Selection cancelled.")

    return [_normalize_selected_path(path) for path in selected_paths]


def _select_folder_with_tkinter(title):
    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    selected_path = filedialog.askdirectory(title=title)
    root.destroy()

    if not selected_path:
        raise ValueError("Selection cancelled.")

    return _normalize_selected_path(selected_path)


@app.route("/select-folder", methods=["GET"])
@app.route("/api/select-folder", methods=["GET"])
def select_folder():
    if not is_local_env():
        return jsonify({"error": "Folder picker is not supported in web mode. Please drag and drop or upload folders directly."}), 400
    try:
        if sys.platform == "darwin":
            selected_path = _select_destination_with_macos_dialog()
        else:
            selected_path = _select_folder_with_tkinter("Select a folder for NeuroSort AI")
        return jsonify({"path": selected_path})
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except Exception as error:
        print(f"Error selecting folder: {str(error)}")
        return jsonify({"error": "Could not open the folder picker."}), 500


@app.route("/select-files", methods=["GET"])
@app.route("/api/select-files", methods=["GET"])
def select_files():
    if not is_local_env():
        return jsonify({"error": "File picker is not supported in web mode. Please drag and drop or upload files directly."}), 400
    try:
        if sys.platform == "darwin":
            selected_paths = _select_files_with_macos_dialog()
        else:
            selected_paths = _select_files_with_tkinter()
        return jsonify({"paths": selected_paths})
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except Exception as error:
        print(f"Error selecting files: {str(error)}")
        return jsonify({"error": "Could not open the file picker."}), 500


@app.route("/select-folders", methods=["GET"])
@app.route("/api/select-folders", methods=["GET"])
def select_folders():
    if not is_local_env():
        return jsonify({"error": "Folder picker is not supported in web mode. Please drag and drop or upload folders directly."}), 400
    try:
        if sys.platform == "darwin":
            selected_paths = _select_folders_with_macos_dialog()
        else:
            selected_paths = [_select_folder_with_tkinter("Select a folder for NeuroSort AI")]
        return jsonify({"paths": selected_paths})
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except Exception as error:
        print(f"Error selecting folders: {str(error)}")
        return jsonify({"error": "Could not open the folder picker."}), 500


@app.route("/select-destination", methods=["GET"])
@app.route("/api/select-destination", methods=["GET"])
def select_destination():
    if not is_local_env():
        return jsonify({"error": "Destination picker is not supported in web mode."}), 400
    try:
        if sys.platform == "darwin":
            selected_path = _select_destination_with_macos_dialog()
        else:
            selected_path = _select_folder_with_tkinter("Select an output folder for NeuroSort AI")
        return jsonify({"path": selected_path})
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except Exception as error:
        print(f"Error selecting destination: {str(error)}")
        return jsonify({"error": "Could not open the destination picker."}), 500


@app.route("/organize", methods=["POST"])
@app.route("/api/organize", methods=["POST"])
def organize():
    data = request.json or {}
    files_metadata = data.get("files_metadata")
    sources = data.get("sources")
    path = data.get("path", "")
    destination_path = data.get("destinationPath") or None
    sort_by = data.get("sortBy", "name")
    apply_changes = bool(data.get("applyChanges", False))

    try:
        if files_metadata is not None:
            from organizer import organize_metadata
            result = organize_metadata(files_metadata, sort_by=sort_by)
        elif not is_local_env():
            return jsonify({"error": "Local paths are not supported in web mode. Please upload files directly."}), 400
        elif sources:
            result = organize_sources(
                sources,
                sort_by=sort_by,
                apply_changes=apply_changes,
                destination_path=destination_path,
            )
        else:
            result = organize_folder(path, sort_by=sort_by, apply_changes=apply_changes)
        return jsonify(result)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except Exception as error:
        print(f"Error organizing folder: {str(error)}")
        return jsonify({"error": "An error occurred while organizing files."}), 500


@app.route("/save-organized", methods=["POST"])
@app.route("/api/save-organized", methods=["POST"])
def save_organized():
    if not is_local_env():
        return jsonify({"error": "Saving locally is not supported in web mode. Files will be zipped and downloaded through your browser."}), 400
    data = request.json or {}
    sources = data.get("sources") or []
    sort_by = data.get("sortBy", "name")
    destination_path = data.get("destinationPath") or None
    save_mode = data.get("saveMode", "downloads")

    try:
        result = save_organized_copy(
            sources,
            sort_by=sort_by,
            destination_path=destination_path,
            save_mode=save_mode,
        )
        return jsonify(result)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except Exception as error:
        print(f"Error saving organized files: {str(error)}")
        return jsonify({"error": "An error occurred while saving organized files."}), 500


@app.route("/chat", methods=["POST"])
@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.json or {}
    message = data.get("message", "")
    files_metadata = data.get("files_metadata") or []
    sources = data.get("sources") or []
    api_key = data.get("api_key") or None

    if not message:
        return jsonify({"error": "Message is required."}), 400

    try:
        from organizer import chat_with_s0ucipher
        response = chat_with_s0ucipher(message, files_metadata=files_metadata, sources=sources, api_key=api_key)
        return jsonify({"response": response})
    except Exception as error:
        print(f"Error in s0ucipher chat: {str(error)}")
        return jsonify({"error": "An error occurred while chatting with s0ucipher."}), 500


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    if path.startswith("api/"):
        return jsonify({"error": "API route not found."}), 404

    requested_file = os.path.join(FRONTEND_DIST, path)
    if path and os.path.exists(requested_file) and os.path.isfile(requested_file):
        return send_from_directory(FRONTEND_DIST, path)

    index_path = os.path.join(FRONTEND_DIST, "index.html")
    if os.path.exists(index_path):
        return send_from_directory(FRONTEND_DIST, "index.html")

    return jsonify({
        "error": "Frontend build not found.",
        "fix": "Run npm run build inside the frontend folder, then restart Flask.",
    }), 404


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5055"))
    app.run(host="0.0.0.0", debug=True, port=port, use_reloader=False)
