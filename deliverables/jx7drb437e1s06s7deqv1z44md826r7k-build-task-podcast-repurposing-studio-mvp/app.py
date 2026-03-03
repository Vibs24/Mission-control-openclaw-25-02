from flask import Flask, render_template, request, jsonify, send_file
import re, io, json
from datetime import datetime

app = Flask(__name__)


def clean_text(t: str) -> str:
    return re.sub(r"\s+", " ", (t or "").strip())


def split_sentences(t: str):
    parts = re.split(r'(?<=[.!?])\s+', clean_text(t))
    return [p.strip() for p in parts if len(p.strip()) > 25]


def words(t: str):
    return re.findall(r"[A-Za-z0-9']+", t.lower())


def top_terms(transcript: str, k=20):
    stop = set("the a an and or but if is are was were be been to of in on for with as at by from this that it we you they i he she them our your their have has had not can will just about into over under out up down".split())
    freq = {}
    for w in words(transcript):
        if len(w) < 4 or w in stop:
            continue
        freq[w] = freq.get(w, 0) + 1
    return [w for w,_ in sorted(freq.items(), key=lambda x:(-x[1], x[0]))[:k]]


def pick(sentences, i):
    if not sentences:
        return ""
    return sentences[i % len(sentences)]


def timestamps(transcript: str):
    s = split_sentences(transcript)
    marks = []
    minute = 0
    for i, sent in enumerate(s[:8]):
        mm = minute // 60
        ss = minute % 60
        marks.append(f"{mm:02d}:{ss:02d} {sent[:70]}...")
        minute += 3 + (i % 2)
    return marks


def generate(payload):
    title = clean_text(payload.get("episode_title", "Untitled Episode"))
    guest = clean_text(payload.get("guest_name", "Guest"))
    transcript = clean_text(payload.get("transcript", ""))
    url = clean_text(payload.get("url", ""))
    sents = split_sentences(transcript)
    terms = top_terms(transcript, 30)

    x_posts = []
    hooks = [
        "Most teams get this wrong:", "Hot take:", "If you're building in public, read this:",
        "I wish I knew this earlier:", "Unpopular but true:", "This changed how I work:",
        "Steal this framework:", "The hidden bottleneck:", "Counterintuitive lesson:", "Do this before your next launch:"
    ]
    for i in range(10):
        core = pick(sents, i)[:170]
        tag = terms[i] if i < len(terms) else "strategy"
        x_posts.append(f"{hooks[i]} {core} Key idea: {tag}. #{tag} #podcast")

    linkedin = []
    for i in range(3):
        a = pick(sents, i*2)
        b = pick(sents, i*2+1)
        linkedin.append(
            f"I just listened to \"{title}\" with {guest}.\n\n"
            f"One insight that stood out: {a}\n\n"
            f"Why it matters: {b}\n\n"
            f"Practical takeaway:\n- Focus on {terms[i] if i < len(terms) else 'execution'}\n- Remove busywork\n- Measure outcomes weekly\n\n"
            f"What would you apply first?"
        )

    newsletter = (
        f"# {title}: Key Lessons with {guest}\n\n"
        f"In this episode, we unpacked practical lessons on {', '.join(terms[:6]) if terms else 'execution and growth'}.\n\n"
        f"## What stood out\n"
        + "\n".join([f"- {pick(sents, i)}" for i in range(min(6, len(sents)))]) +
        "\n\n## Action plan for this week\n"
        "1. Pick one process to simplify.\n"
        "2. Turn one insight into a measurable experiment.\n"
        "3. Share learnings with your team by Friday.\n\n"
        + (f"Listen/watch: {url}\n" if url else "")
    )

    yt_titles = [
        f"{title}: {guest} on What Actually Moves the Needle",
        f"{guest} Breaks Down {terms[0].title() if terms else 'Execution'} (Podcast Highlights)",
        f"From Transcript to Strategy: {title}"
    ]
    yt_desc = (
        f"In this episode, {guest} shares practical insights from {title}.\n\n"
        "Highlights:\n" + "\n".join([f"- {pick(sents, i)[:120]}" for i in range(min(5, len(sents)))]) +
        "\n\nTimestamps:\n" + "\n".join(timestamps(transcript)) +
        (f"\n\nOriginal link: {url}" if url else "")
    )
    yt_tags = [t for t in terms[:15]]
    while len(yt_tags) < 15:
        yt_tags.append(f"podcast-{len(yt_tags)+1}")

    clip_hooks = []
    for i in range(10):
        clip_hooks.append(f"\"{pick(sents, i)[:90]}\" — 20s clip hook around {terms[i] if i < len(terms) else 'insight'}")

    return {
        "x_posts": x_posts,
        "linkedin_posts": linkedin,
        "newsletter": newsletter,
        "youtube": {
            "title_options": yt_titles,
            "description": yt_desc,
            "timestamps": timestamps(transcript),
            "tag_ideas": yt_tags,
        },
        "clip_hooks": clip_hooks,
    }


@app.route('/')
def home():
    return render_template('index.html')


@app.post('/api/generate')
def api_generate():
    data = request.get_json(force=True)
    out = generate(data)
    return jsonify(out)


@app.post('/api/export_markdown')
def api_export_markdown():
    data = request.get_json(force=True)
    out = generate(data)
    md = [f"# Podcast Repurposing Studio Export\n", f"Generated: {datetime.utcnow().isoformat()} UTC\n"]
    md.append("## 10 X Posts\n" + "\n".join([f"{i+1}. {p}" for i,p in enumerate(out['x_posts'])]))
    md.append("\n## 3 LinkedIn Posts\n" + "\n\n---\n\n".join(out['linkedin_posts']))
    md.append("\n## Newsletter Draft\n" + out['newsletter'])
    md.append("\n## YouTube Package\n### Title Options\n" + "\n".join([f"- {t}" for t in out['youtube']['title_options']]))
    md.append("\n### Description\n" + out['youtube']['description'])
    md.append("\n### Timestamps\n" + "\n".join([f"- {t}" for t in out['youtube']['timestamps']]))
    md.append("\n### Tag Ideas\n" + ", ".join(out['youtube']['tag_ideas']))
    md.append("\n## 10 Short-form Clip Hook Ideas\n" + "\n".join([f"{i+1}. {c}" for i,c in enumerate(out['clip_hooks'])]))
    body = "\n\n".join(md)
    return send_file(io.BytesIO(body.encode('utf-8')), mimetype='text/markdown', as_attachment=True, download_name='podcast_repurpose_output.md')


if __name__ == '__main__':
    app.run(debug=True)
