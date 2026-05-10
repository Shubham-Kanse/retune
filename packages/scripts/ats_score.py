#!/usr/bin/env python3
"""
ats_score.py — Scores a resume's keyword coverage against a job description using TF-IDF and noun phrase extraction.

Usage:
    python3 ats_score.py --jd job_description.txt --resume resume_content.md
    python3 ats_score.py --jd-text "..." --resume-text "..."
    python3 ats_score.py --jd job.txt --resume resume.md --output-file ats_report.json

Output: Structured ATS coverage report to stdout or JSON file.
"""

import argparse
import json
import re
import sys
from collections import Counter


STOPWORDS = {
    "the", "a", "an", "and", "or", "in", "of", "to", "for", "with", "is", "are", "will", "be",
    "at", "this", "that", "we", "our", "you", "your", "us", "it", "as", "on", "by", "from",
    "have", "has", "had", "not", "do", "does", "can", "may", "must", "please", "experience",
    "years", "ability", "knowledge", "skills", "understanding", "work", "working", "strong",
    "good", "excellent", "great", "team", "required", "preferred", "plus", "bonus", "more",
    "also", "any", "all", "both", "each", "other", "some", "such", "no", "nor", "only",
    "own", "same", "so", "than", "very", "who", "which", "while", "while", "would"
}


def extract_text(path=None, text=None):
    if path:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    return text or ""


def tokenize(text):
    """Lowercase, strip markdown/punctuation, split into words."""
    text = re.sub(r"[#*_\-•|`>\[\]()]", " ", text.lower())
    text = re.sub(r"[^a-z0-9\s/+#\-]", " ", text)
    words = text.split()
    return words


def extract_noun_phrases(text):
    """
    Extract 1-4 word phrases from text that are likely keywords/skills.
    Filters against stopwords to identify role-specific terms.
    """
    words = tokenize(text)
    phrases = []

    # Single words that are content words (not stopwords, len >= 3)
    for w in words:
        if w not in STOPWORDS and len(w) >= 3:
            phrases.append(w)

    # Bigrams (2-word phrases) — at least one must be a content word
    for i in range(len(words) - 1):
        if (words[i] not in STOPWORDS or words[i+1] not in STOPWORDS) and \
           len(words[i]) >= 2 and len(words[i+1]) >= 2:
            phrases.append(f"{words[i]} {words[i+1]}")

    # Trigrams (3-word phrases) — both ends must be content words
    for i in range(len(words) - 2):
        if words[i] not in STOPWORDS and words[i+2] not in STOPWORDS and \
           len(words[i]) >= 2 and len(words[i+1]) >= 2 and len(words[i+2]) >= 2:
            phrases.append(f"{words[i]} {words[i+1]} {words[i+2]}")

    # 4-grams rarely useful for skill extraction; skip to keep count reasonable

    return phrases


def count_occurrences(needle, text):
    """Count how many times a phrase appears in text (case-insensitive)."""
    text_lower = text.lower()
    needle_lower = needle.lower().strip()
    # Use word-boundary matching for single words, substring for phrases
    if " " not in needle_lower:
        # Single word — use word boundaries
        pattern = r'\b' + re.escape(needle_lower) + r'\b'
        return len(re.findall(pattern, text_lower))
    else:
        # Phrase — substring count
        return text_lower.count(needle_lower)


def extract_jd_keywords(jd_text):
    """
    Extract likely keywords from a JD using TF-IDF + noun phrase extraction.
    Groups into required vs preferred based on section heuristics.
    Returns (required_list, preferred_list) — top 40/20 by frequency.
    """
    lines = jd_text.split("\n")
    required_phrases = Counter()
    preferred_phrases = Counter()
    current_section = "required"

    for line in lines:
        line_lower = line.lower().strip()

        # Detect section switches
        if any(w in line_lower for w in ["nice to have", "preferred", "desirable", "bonus", "a plus", "optional"]):
            current_section = "preferred"
        elif any(w in line_lower for w in ["required", "must have", "essential", "minimum", "qualifications", "responsibilities", "must-have"]):
            current_section = "required"

        # Extract noun phrases from this line
        phrases = extract_noun_phrases(line)

        for phrase in phrases:
            if current_section == "required":
                required_phrases[phrase] += 1
            else:
                preferred_phrases[phrase] += 1

    # Convert to lists, ranked by frequency
    # Keep top 40 required and top 20 preferred
    required = [phrase for phrase, count in required_phrases.most_common(60) if count >= 1][:40]
    preferred = [phrase for phrase, count in preferred_phrases.most_common(30) if count >= 1][:20]

    # Deduplicate: remove preferred items that are also required
    preferred = [p for p in preferred if p not in required]

    return required, preferred


def score_resume(jd_text, resume_text):
    """Score resume against JD. Returns structured report."""
    required, preferred = extract_jd_keywords(jd_text)

    report = {
        "required": [],
        "preferred": [],
        "missing_required": [],
        "missing_preferred": []
    }

    for kw in required:
        count = count_occurrences(kw, resume_text)
        entry = {"keyword": kw, "count": count, "status": "✓" if count > 0 else "✗"}
        if count > 5:
            entry["warning"] = "OVER-STUFFED (>5×)"
        report["required"].append(entry)
        if count == 0:
            report["missing_required"].append(kw)

    for kw in preferred:
        count = count_occurrences(kw, resume_text)
        entry = {"keyword": kw, "count": count, "status": "✓" if count > 0 else "✗"}
        report["preferred"].append(entry)
        if count == 0:
            report["missing_preferred"].append(kw)

    req_total = len(required)
    req_found = req_total - len(report["missing_required"])
    pref_total = len(preferred)
    pref_found = pref_total - len(report["missing_preferred"])

    # FIX: Return None (not 100) when no keywords detected
    req_pct = (req_found / req_total * 100) if req_total else None
    pref_pct = (pref_found / pref_total * 100) if pref_total else None

    report["scores"] = {
        "required_coverage": f"{req_found}/{req_total} ({req_pct:.0f}%)" if req_total else "N/A (no required keywords detected)",
        "preferred_coverage": f"{pref_found}/{pref_total} ({pref_pct:.0f}%)" if pref_total else "N/A (no preferred keywords detected)",
        "required_pct": req_pct,
        "preferred_pct": pref_pct,
    }

    # Overall verdict
    if req_pct is not None and pref_pct is not None:
        if req_pct >= 85 and pref_pct >= 70:
            report["verdict"] = "✅ PASS — Strong ATS match"
        elif req_pct >= 70:
            report["verdict"] = "⚠️ MARGINAL — Review missing keywords"
        else:
            report["verdict"] = "❌ FAIL — Significant keyword gaps"
    elif req_pct is None:
        report["verdict"] = "⚠️ WARNING — No keywords detected in JD (cannot score)"
    else:
        report["verdict"] = "⚠️ WARNING — No preferred keywords detected"

    return report


def print_report(report):
    print("\n" + "=" * 60)
    print("ATS KEYWORD COVERAGE REPORT")
    print("=" * 60)

    print(f"\n{report['verdict']}")
    print(f"\nRequired Skills: {report['scores']['required_coverage']}")
    print(f"Preferred Skills: {report['scores']['preferred_coverage']}")

    if report["required"]:
        print("\n--- Required Keywords ---")
        for entry in report["required"]:
            warning = f"  ⚠️ {entry['warning']}" if "warning" in entry else ""
            print(f"  {entry['status']} {entry['keyword']} (×{entry['count']}){warning}")

    if report["preferred"]:
        print("\n--- Preferred Keywords ---")
        for entry in report["preferred"]:
            print(f"  {entry['status']} {entry['keyword']} (×{entry['count']})")

    if report["missing_required"]:
        print(f"\n🚨 MISSING REQUIRED: {', '.join(report['missing_required'])}")

    if report["missing_preferred"]:
        print(f"\n⚠️  MISSING PREFERRED: {', '.join(report['missing_preferred'])}")

    print("\n" + "=" * 60)


def main():
    parser = argparse.ArgumentParser(description="Score resume ATS keyword coverage against a job description")
    parser.add_argument("--jd", help="Path to job description text file")
    parser.add_argument("--jd-text", help="Job description as inline text")
    parser.add_argument("--resume", help="Path to resume content markdown file")
    parser.add_argument("--resume-text", help="Resume content as inline text")
    parser.add_argument("--json", action="store_true", dest="output_json",
                        help="Output machine-readable JSON to stdout")
    parser.add_argument("--output-file", help="Write JSON output to this file path instead of stdout")
    args = parser.parse_args()

    jd_text = extract_text(args.jd, args.jd_text)
    resume_text = extract_text(args.resume, args.resume_text)

    if not jd_text:
        print("ERROR: Provide --jd or --jd-text")
        sys.exit(1)
    if not resume_text:
        print("ERROR: Provide --resume or --resume-text")
        sys.exit(1)

    report = score_resume(jd_text, resume_text)

    if args.output_json or args.output_file:
        json_output = {
            "required_pct": report["scores"]["required_pct"],
            "preferred_pct": report["scores"]["preferred_pct"],
            "required_coverage": report["scores"]["required_coverage"],
            "preferred_coverage": report["scores"]["preferred_coverage"],
            "missing_required": report["missing_required"],
            "missing_preferred": report["missing_preferred"],
            "verdict": report["verdict"],
        }
        if args.output_file:
            with open(args.output_file, "w", encoding="utf-8") as f:
                json.dump(json_output, f, indent=2)
        else:
            print(json.dumps(json_output))
    else:
        print_report(report)


if __name__ == "__main__":
    main()
