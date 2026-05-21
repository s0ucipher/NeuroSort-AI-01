import os
import shutil
from collections import Counter, defaultdict
from datetime import datetime, timedelta


CATEGORY_FOLDERS = {
    "Study": "Study Hub",
    "Photos": "Photos",
    "PDFs": "PDFs",
    "Documents": "Documents",
    "Videos": "Videos",
    "Audio": "Audio",
    "Archives": "Archives",
    "Code": "Code",
    "Others": "Others",
}

SORTED_EXTENSIONS = {
    "Photos": (".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif", ".svg", ".bmp", ".tif", ".tiff"),
    "PDFs": (".pdf",),
    "Documents": (".docx", ".doc", ".txt", ".pptx", ".ppt", ".xlsx", ".xls", ".csv", ".md", ".rtf"),
    "Videos": (".mp4", ".mkv", ".mov", ".avi", ".webm", ".m4v"),
    "Audio": (".mp3", ".wav", ".aac", ".m4a", ".flac", ".ogg"),
    "Archives": (".zip", ".rar", ".7z", ".tar", ".gz"),
    "Code": (".py", ".js", ".jsx", ".ts", ".tsx", ".html", ".css", ".json", ".java", ".c", ".cpp", ".swift"),
}

STUDY_KEYWORDS = (
    "notes",
    "assignment",
    "homework",
    "lecture",
    "syllabus",
    "class",
    "semester",
    "question",
    "solution",
)

HIGH_PRIORITY_KEYWORDS = (
    "final",
    "exam",
    "urgent",
    "deadline",
    "submit",
    "admit",
    "marksheet",
    "certificate",
    "result",
    "resume",
    "tax",
)

MEDIUM_PRIORITY_KEYWORDS = (
    "notes",
    "assignment",
    "project",
    "report",
    "proposal",
    "draft",
    "important",
    "invoice",
    "receipt",
)

IGNORED_DIRECTORIES = {
    ".git",
    ".venv",
    "__pycache__",
    "dist",
    "node_modules",
    "NeuroSort Organized",
}

IGNORED_FILES = {".DS_Store", "Thumbs.db"}


def classify_file(file):
    name = file.lower()

    if any(keyword in name for keyword in STUDY_KEYWORDS):
        return "Study"

    for category, extensions in SORTED_EXTENSIONS.items():
        if name.endswith(extensions):
            return category

    return "Others"


def get_priority(file):
    name = file.lower()

    if any(keyword in name for keyword in HIGH_PRIORITY_KEYWORDS):
        return "High"
    if any(keyword in name for keyword in MEDIUM_PRIORITY_KEYWORDS):
        return "Medium"

    return "Low"


def _classify_with_extra_extensions(file):
    return classify_file(file)


def _normalize_path(path):
    return os.path.abspath(os.path.expanduser(path))


def _file_type(file):
    return os.path.splitext(file)[1].lower() or "no extension"


def _safe_destination(destination_root, folder_name, file_name):
    destination_dir = os.path.join(destination_root, folder_name)
    destination = os.path.join(destination_dir, file_name)
    base, extension = os.path.splitext(destination)
    index = 1

    while os.path.exists(destination):
        destination = f"{base} ({index}){extension}"
        index += 1

    return destination_dir, destination


def _default_destination(sources):
    first_source = sources[0]
    if len(sources) == 1 and os.path.isdir(first_source):
        return first_source

    first_parent = first_source if os.path.isdir(first_source) else os.path.dirname(first_source)
    return os.path.join(first_parent, "NeuroSort Organized")


def _downloads_folder():
    downloads = os.path.join(os.path.expanduser("~"), "Downloads")
    if os.path.isdir(downloads):
        return downloads
    return os.path.expanduser("~")


def _export_root(parent_folder):
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    return os.path.join(_normalize_path(parent_folder), f"NeuroSort Export {timestamp}")


def _sort_records(records, sort_by):
    if sort_by == "type":
        return sorted(records, key=lambda item: (item.get("type") or "", item.get("name" or "").lower(), item.get("source" or "").lower()))
    elif sort_by == "size-desc":
        return sorted(records, key=lambda item: item.get("size_bytes") or 0, reverse=True)
    elif sort_by == "size-asc":
        return sorted(records, key=lambda item: item.get("size_bytes") or 0)
    elif sort_by == "priority":
        priority_weight = {"High": 3, "Medium": 2, "Low": 1}
        return sorted(records, key=lambda item: (priority_weight.get(item.get("priority", "Low"), 0), item.get("name", "").lower()), reverse=True)
    # Default: name (alphabetical)
    return sorted(records, key=lambda item: (item.get("name") or "").lower())


def _scan_sources(sources):
    if not sources:
        raise ValueError("Select at least one file or folder.")

    expanded_sources = []
    collected_files = []
    seen_files = set()

    for source in sources:
        if not source:
            continue

        expanded_source = _normalize_path(source)
        if not os.path.exists(expanded_source):
            raise ValueError(f"Selected path does not exist: {expanded_source}")

        expanded_sources.append(expanded_source)

        if os.path.isfile(expanded_source):
            real_path = os.path.realpath(expanded_source)
            if real_path not in seen_files and os.path.basename(expanded_source) not in IGNORED_FILES:
                seen_files.add(real_path)
                collected_files.append(expanded_source)
            continue

        for root, dirs, files in os.walk(expanded_source):
            dirs[:] = [
                folder
                for folder in dirs
                if folder not in IGNORED_DIRECTORIES
                and not folder.startswith(".")
                and not folder.startswith("NeuroSort Export")
            ]

            for file in files:
                if file in IGNORED_FILES or file.startswith("."):
                    continue

                source_path = os.path.join(root, file)
                real_path = os.path.realpath(source_path)
                if real_path in seen_files:
                    continue

                seen_files.add(real_path)
                collected_files.append(source_path)

    if not collected_files:
        raise ValueError("No files were found in the selected sources.")

    return expanded_sources, collected_files


def _smart_tags(file_name, category, priority, duplicate_count, modified_time):
    name = file_name.lower()
    tags = []

    if category == "Study":
        tags.append("academic")
    if category == "Photos":
        tags.append("photo")
    if category == "PDFs":
        tags.append("pdf")
    if category == "Videos":
        tags.append("video")
    if category == "Documents":
        tags.append("document")
    if priority == "High":
        tags.append("exam-ready")
    if priority == "Medium":
        tags.append("review-soon")
    if duplicate_count > 1:
        tags.append("duplicate-candidate")
    if modified_time < datetime.now() - timedelta(days=180):
        tags.append("cleanup-candidate")
    if "project" in name or "report" in name:
        tags.append("project-work")
    if category in {"Photos", "Videos"}:
        tags.append("media")

    return tags or ["standard"]


def _confidence_for(category, priority, tags):
    score = 0.72
    if category != "Others":
        score += 0.13
    if priority != "Low":
        score += 0.06
    if any(tag in tags for tag in ("academic", "media", "pdf", "document")):
        score += 0.04
    return min(score, 0.97)


def _importance_score(file_name, category, priority, duplicate_count, modified_time):
    score = {"High": 86, "Medium": 63, "Low": 34}[priority]
    name = file_name.lower()

    if category == "Study":
        score += 7
    if category in {"PDFs", "Documents"}:
        score += 4
    if "project" in name or "report" in name:
        score += 4
    if duplicate_count > 1:
        score -= 4
    if modified_time < datetime.now() - timedelta(days=365):
        score -= 5

    return max(18, min(score, 98))


def _suggested_name(file_name, category, priority):
    base, extension = os.path.splitext(file_name)
    cleaned_base = base.replace(" ", "_")
    if priority == "High":
        return f"Important_{cleaned_base}{extension}"
    if category == "Study":
        return f"Study_{cleaned_base}{extension}"
    return f"{category}_{cleaned_base}{extension}"


def _ai_reason(file_name, category, priority, tags):
    if priority == "High":
        return "s0ucipher found important deadline, exam, result, or certificate signals, so this file is high priority."
    if category == "Study":
        return "s0ucipher detected study keywords like notes, assignment, lecture, or syllabus."
    if category == "PDFs":
        return "s0ucipher recognized a PDF and separated it for document review."
    if category != "Others":
        return f"s0ucipher used the file extension to classify this as {category}."
    if "cleanup-candidate" in tags:
        return "s0ucipher could not match a strong category, but the file looks old enough to review."
    return "s0ucipher placed this in Others because no strong rule matched."


def _build_record(source_path, duplicate_count):
    file_name = os.path.basename(source_path)
    category = _classify_with_extra_extensions(file_name)
    priority = get_priority(file_name)
    modified_time = datetime.fromtimestamp(os.path.getmtime(source_path))
    tags = _smart_tags(file_name, category, priority, duplicate_count, modified_time)
    importance_score = _importance_score(file_name, category, priority, duplicate_count, modified_time)

    return {
        "name": file_name,
        "source": source_path,
        "type": _file_type(file_name),
        "category": category,
        "priority": priority,
        "folder": CATEGORY_FOLDERS[category],
        "size_bytes": os.path.getsize(source_path),
        "modified_at": modified_time.isoformat(timespec="seconds"),
        "smart_tags": tags,
        "ai_reason": _ai_reason(file_name, category, priority, tags),
        "confidence": round(_confidence_for(category, priority, tags), 2),
        "importance_score": importance_score,
        "suggested_name": _suggested_name(file_name, category, priority),
    }


def _build_record_from_metadata(meta, duplicate_count):
    file_name = meta["name"]
    category = _classify_with_extra_extensions(file_name)
    priority = get_priority(file_name)

    last_mod = meta.get("lastModified")
    if last_mod is not None:
        try:
            modified_time = datetime.fromtimestamp(last_mod / 1000.0)
        except Exception:
            modified_time = datetime.now()
    else:
        modified_time = datetime.now()

    tags = _smart_tags(file_name, category, priority, duplicate_count, modified_time)
    importance_score = _importance_score(file_name, category, priority, duplicate_count, modified_time)

    return {
        "name": file_name,
        "source": meta.get("path") or file_name,
        "type": _file_type(file_name),
        "category": category,
        "priority": priority,
        "folder": CATEGORY_FOLDERS[category],
        "size_bytes": meta.get("size_bytes") or meta.get("size") or 0,
        "modified_at": modified_time.isoformat(timespec="seconds"),
        "smart_tags": tags,
        "ai_reason": _ai_reason(file_name, category, priority, tags),
        "confidence": round(_confidence_for(category, priority, tags), 2),
        "importance_score": importance_score,
        "suggested_name": _suggested_name(file_name, category, priority),
    }


def _metadata_source_count(files_metadata):
    source_groups = set()
    for meta in files_metadata:
        path = meta.get("path") or meta.get("name") or ""
        top_level = path.split("/", 1)[0] if "/" in path else path
        if top_level:
            source_groups.add(top_level)
    return len(source_groups)


def organize_metadata(files_metadata, sort_by="name"):
    duplicate_counts = Counter(meta["name"].lower() for meta in files_metadata)
    records = [_build_record_from_metadata(meta, duplicate_counts[meta["name"].lower()]) for meta in files_metadata]
    records = _sort_records(records, sort_by)

    categories = defaultdict(list)
    priorities = {"High": [], "Medium": [], "Low": []}
    study_files = []
    important_files = []
    cleanup_suggestions = []
    after_structure = defaultdict(list)
    duplicate_groups = _duplicate_groups(records)

    for record in records:
        categories[record["category"]].append(record)
        priorities[record["priority"]].append(record)
        after_structure[record["folder"]].append(record)

        if record["category"] == "Study":
            study_files.append(record)
        if record["priority"] == "High":
            important_files.append(record)
        if "duplicate-candidate" in record["smart_tags"]:
            cleanup_suggestions.append({
                "file": record["name"],
                "source": record["source"],
                "reason": "Possible duplicate name across selected sources. Review before deleting.",
            })
        if "cleanup-candidate" in record["smart_tags"]:
            cleanup_suggestions.append({
                "file": record["name"],
                "source": record["source"],
                "reason": "Old file. Consider archiving or cleaning it up.",
            })

    dashboard = {
        "total_files": len(records),
        "source_count": _metadata_source_count(files_metadata),
        "total_categories": sum(1 for values in categories.values() if values),
        "important_files": len(important_files),
        "study_files": len(study_files),
        "duplicate_groups": len(duplicate_groups),
        "cleanup_items": len(cleanup_suggestions),
    }

    destination_root = "NeuroSort Organized"

    return {
        "path": destination_root,
        "sources": [],
        "destination_path": destination_root,
        "sort_by": sort_by,
        "applied_changes": False,
        "before": records,
        "categories": dict(categories),
        "after_structure": dict(after_structure),
        "duplicates": duplicate_groups,
        "study_files": study_files,
        "important_files": important_files,
        "priorities": priorities,
        "cleanup_suggestions": cleanup_suggestions,
        "moved_files": [],
        "dashboard": dashboard,
        "assistant": _s0ucipher_assistant(records, dashboard, duplicate_groups, destination_root, apply_changes=False),
    }


def _duplicate_groups(records):
    grouped = defaultdict(list)
    for record in records:
        grouped[record["name"].lower()].append(record)

    return [
        {
            "name": records_for_name[0]["name"],
            "count": len(records_for_name),
            "files": records_for_name,
        }
        for records_for_name in grouped.values()
        if len(records_for_name) > 1
    ]


def _s0ucipher_assistant(records, dashboard, duplicate_groups, destination_path, apply_changes):
    high_priority = [record for record in records if record["priority"] == "High"]
    medium_priority = [record for record in records if record["priority"] == "Medium"]
    low_priority = [record for record in records if record["priority"] == "Low"]
    study_files = [record for record in records if record["category"] == "Study"]
    cleanup_files = [record for record in records if "cleanup-candidate" in record["smart_tags"]]
    category_counts = Counter(record["category"] for record in records)
    strongest_category = category_counts.most_common(1)[0][0] if category_counts else "Mixed"

    actions = []
    if study_files:
        actions.append(f"Create a Study Hub with {len(study_files)} academic file(s).")
    if high_priority:
        actions.append(f"Highlight {len(high_priority)} exam/final file(s) as high priority.")
    if medium_priority:
        actions.append(f"Review {len(medium_priority)} medium-priority file(s) after the urgent set.")
    if low_priority:
        actions.append(f"Keep {len(low_priority)} low-priority file(s) organized without interrupting the main work.")
    if duplicate_groups:
        actions.append(f"Review {len(duplicate_groups)} duplicate name group(s) before deleting anything.")
    if cleanup_files:
        actions.append(f"Archive or review {len(cleanup_files)} old file(s).")
    if not actions:
        actions.append("No urgent cleanup found. Organize by category and keep preview mode for safety.")

    return {
        "name": "s0ucipher",
        "summary": (
            f"s0ucipher scanned {dashboard['total_files']} file(s) from {dashboard['source_count']} source(s). "
            f"The strongest pattern is {strongest_category}; {len(high_priority)} high-priority file(s) should be handled first. "
            f"The planned output is {destination_path}."
        ),
        "recommended_actions": actions,
        "study_plan": [
            "Keep notes and assignments inside Study Hub.",
            "Open high-priority files first before exams.",
            "Use duplicate suggestions only for review, never automatic deletion.",
        ],
        "safety_note": (
            "Preview mode is active, so files are not moved yet."
            if not apply_changes
            else "Move mode is active. Files were sent to organized folders."
        ),
        "automation_ideas": [
            "Suggest cleaner file names.",
            "Detect exam files and important study material.",
            "Separate media, documents, and uncategorized files.",
            "Warn before moving duplicates or old files.",
        ],
    }


def organize_sources(sources, sort_by="name", apply_changes=False, destination_path=None):
    expanded_sources, source_files = _scan_sources(sources)
    destination_root = _normalize_path(destination_path) if destination_path else _default_destination(expanded_sources)

    duplicate_counts = Counter(os.path.basename(path).lower() for path in source_files)
    records = [_build_record(path, duplicate_counts[os.path.basename(path).lower()]) for path in source_files]
    records = _sort_records(records, sort_by)

    categories = defaultdict(list)
    priorities = {"High": [], "Medium": [], "Low": []}
    study_files = []
    important_files = []
    cleanup_suggestions = []
    after_structure = defaultdict(list)
    moved_files = []
    duplicate_groups = _duplicate_groups(records)

    for record in records:
        categories[record["category"]].append(record)
        priorities[record["priority"]].append(record)
        after_structure[record["folder"]].append(record)

        if record["category"] == "Study":
            study_files.append(record)
        if record["priority"] == "High":
            important_files.append(record)
        if "duplicate-candidate" in record["smart_tags"]:
            cleanup_suggestions.append({
                "file": record["name"],
                "source": record["source"],
                "reason": "Possible duplicate name across selected sources. Review before deleting.",
            })
        if "cleanup-candidate" in record["smart_tags"]:
            cleanup_suggestions.append({
                "file": record["name"],
                "source": record["source"],
                "reason": "Old file. Consider archiving or cleaning it up.",
            })

        if apply_changes:
            destination_dir, destination = _safe_destination(destination_root, record["folder"], record["name"])
            os.makedirs(destination_dir, exist_ok=True)
            shutil.move(record["source"], destination)
            moved_files.append({
                "from": record["source"],
                "to": destination,
            })

    dashboard = {
        "total_files": len(records),
        "source_count": len(expanded_sources),
        "total_categories": sum(1 for values in categories.values() if values),
        "important_files": len(important_files),
        "study_files": len(study_files),
        "duplicate_groups": len(duplicate_groups),
        "cleanup_items": len(cleanup_suggestions),
    }

    return {
        "path": destination_root,
        "sources": expanded_sources,
        "destination_path": destination_root,
        "sort_by": sort_by,
        "applied_changes": apply_changes,
        "before": records,
        "categories": dict(categories),
        "after_structure": dict(after_structure),
        "duplicates": duplicate_groups,
        "study_files": study_files,
        "important_files": important_files,
        "priorities": priorities,
        "cleanup_suggestions": cleanup_suggestions,
        "moved_files": moved_files,
        "dashboard": dashboard,
        "assistant": _s0ucipher_assistant(records, dashboard, duplicate_groups, destination_root, apply_changes),
    }


def organize_folder(path, sort_by="name", apply_changes=False):
    return organize_sources([path], sort_by=sort_by, apply_changes=apply_changes)


def save_organized_copy(sources, sort_by="name", destination_path=None, save_mode="downloads"):
    parent_folder = _downloads_folder() if save_mode == "downloads" else destination_path
    if not parent_folder:
        raise ValueError("Choose a save location first.")

    preview = organize_sources(sources, sort_by=sort_by, apply_changes=False)
    export_path = _export_root(parent_folder)
    copied_files = []
    skipped_files = []

    for record in preview["before"]:
        if not os.path.exists(record["source"]):
            skipped_files.append({
                "file": record["name"],
                "source": record["source"],
                "reason": "Source file was not found.",
            })
            continue

        destination_dir, destination = _safe_destination(export_path, record["folder"], record["name"])
        os.makedirs(destination_dir, exist_ok=True)
        shutil.copy2(record["source"], destination)
        copied_files.append({
            "from": record["source"],
            "to": destination,
        })

    return {
        "export_path": export_path,
        "copied_files": copied_files,
        "skipped_files": skipped_files,
        "copied_count": len(copied_files),
        "skipped_count": len(skipped_files),
        "save_mode": save_mode,
        "assistant_message": (
            f"s0ucipher saved {len(copied_files)} organized file(s) to {export_path}."
            if copied_files
            else "s0ucipher could not save files because no source files were available."
        ),
    }


def call_gemini_api(prompt, api_key=None):
    import urllib.request
    import json
    api_key_to_use = api_key or os.environ.get("GEMINI_API_KEY")
    if not api_key_to_use:
        return None

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key_to_use}"
    headers = {"Content-Type": "application/json"}
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt}
                ]
            }
        ]
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            return res_data["candidates"][0]["content"]["parts"][0]["text"]
    except Exception as e:
        print(f"Error calling Gemini API: {str(e)}")
        return None


def chat_with_s0ucipher(message, files_metadata=None, sources=None, api_key=None):
    records = []
    if files_metadata:
        duplicate_counts = Counter(meta.get("name", "").lower() for meta in files_metadata)
        records = [_build_record_from_metadata(meta, duplicate_counts[meta.get("name", "").lower()]) for meta in files_metadata]
    elif sources:
        try:
            _, source_files = _scan_sources(sources)
            duplicate_counts = Counter(os.path.basename(path).lower() for path in source_files)
            records = [_build_record(path, duplicate_counts[os.path.basename(path).lower()]) for path in source_files]
        except Exception:
            pass

    # Try Gemini API first if key is present
    api_key_to_use = api_key or os.environ.get("GEMINI_API_KEY")
    if api_key_to_use:
        context = ""
        if records:
            context = "Scanned Files Metadata:\n"
            for r in records[:50]:  # limit to 50 for prompt size
                context += f"- Name: {r['name']}, Category: {r['category']}, Priority: {r['priority']}, Size: {r['size_bytes']} bytes, AI Reason: {r['ai_reason']}\n"
            if len(records) > 50:
                context += f"... and {len(records) - 50} more files.\n"

        system_instruction = (
            "You are s0ucipher, a helpful, intelligent AI agent for a smart file manager named NeuroSort AI. "
            "Your tone is futuristic, professional, supportive, and clever. "
            "You help the user understand which files are important or less important, suggest name updates, "
            "and explain your organization reasoning (e.g. why a file went into Study Hub, PDFs, Photos, etc.).\n"
            f"Here is the context of files currently scanned:\n{context}\n"
            "Respond to the user's query directly, concisely, and in-character."
        )
        prompt = f"{system_instruction}\n\nUser: {message}\ns0ucipher:"
        gemini_response = call_gemini_api(prompt, api_key=api_key_to_use)
        if gemini_response:
            return gemini_response.strip()

    # Heuristic fallback if Gemini API is not configured or fails
    msg = message.lower()
    total_files = len(records)

    categories = Counter(r["category"] for r in records)
    priorities = Counter(r["priority"] for r in records)
    high_priority_files = [r["name"] for r in records if r["priority"] == "High"]
    study_files = [r["name"] for r in records if r["category"] == "Study"]

    matched_file = None
    for r in records:
        if r["name"].lower() in msg:
            matched_file = r
            break

    if matched_file:
        return (
            f"Ah, let's look at **{matched_file['name']}**. I've categorized it under **{matched_file['category']}** "
            f"(saving to folder *{matched_file['folder']}*) with a **{matched_file['priority']}** priority ranking. "
            f"My reasoning: {matched_file['ai_reason']}"
        )

    if "importance" in msg or "priority" in msg or "important" in msg:
        p_summary = ", ".join([f"{count} {p}" for p, count in priorities.items()]) if priorities else "no scanned files"
        high_str = ""
        if high_priority_files:
            high_str = f" Some key high-importance files include: {', '.join(high_priority_files[:5])}."
        return (
            f"I evaluate file importance by scanning for critical keywords (like *exam*, *final*, *invoice*, *tax*) "
            f"as well as checking their modification dates and duplication rates. In this batch, I found: **{p_summary}** files.{high_str}"
        )

    if "category" in msg or "categories" in msg or "folder" in msg or "folders" in msg:
        c_summary = ", ".join([f"{count} in {c}" for c, count in categories.items()]) if categories else "no scanned files"
        return (
            f"I organize files into designated folders based on their extensions and contents: Study Hub, Photos, PDFs, Videos, Documents, and more. "
            f"For your current workspace, I have mapped: **{c_summary}**."
        )

    if "study" in msg or "exam" in msg or "academic" in msg:
        if study_files:
            return (
                f"I detected {len(study_files)} study-related files (like lecture notes, homework, assignments) and placed them in the **Study Hub** folder. "
                f"Files include: {', '.join(study_files[:5])}."
            )
        return "I scan for academic keywords like *notes*, *assignment*, *syllabus*, or *lecture* to organize them into your **Study Hub**. I didn't see any matching study files in this scan, but let me know if you want me to help look for specific documents!"

    if "hello" in msg or "hi" in msg or "hey" in msg:
        return (
            "Greetings! I am **s0ucipher**, your AI organizer. I can help you analyze your folder structures, "
            "explain why files are flagged as High or Low priority, and restructure them. What would you like to know about your files?"
        )

    if total_files > 0:
        return (
            f"I am actively monitoring your workspace with **{total_files}** scanned files in memory. "
            f"You have {priorities.get('High', 0)} high-importance items and {categories.get('Study', 0)} academic files. "
            "Ask me about a specific file, why certain items are prioritized, or how I organize them!"
        )

    return (
        "I am s0ucipher, your smart file management agent. It looks like you haven't scanned any files or folders yet. "
        "Add some items in the sidebar and click **Organize Batch** so I can analyze them for you!"
    )
