#!/usr/bin/env python3
"""Build a reproducible public-data audit of recent English YouTube niches.

This script intentionally uses only public YouTube pages. It does not estimate
earnings, infer private audience demographics, or treat one viral upload as a
repeatable niche signal.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import random
import re
import statistics
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterable


TODAY = date(2026, 8, 24)
ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/139.0.0.0 Safari/537.36"
)


# Discovery terms are intentionally spread across broad content families. The
# goal is to find channels from what viewers search/watch, not from lists that
# market themselves as "faceless niches".
QUERY_GROUPS: dict[str, list[str]] = {
    "business_economics": [
        "why companies are failing explained",
        "hidden business model explained",
        "why everything is expensive explained",
        "rise and fall of company documentary",
        "business disaster documentary",
        "how companies make money explained",
        "economic crisis explained simply",
        "corporate scandal explained documentary",
    ],
    "consumer_systems": [
        "hidden fees explained America",
        "food industry secrets explained",
        "grocery prices explained America",
        "insurance costs explained America",
        "subscription economy explained",
        "consumer scam documentary",
        "what happens to returns explained",
        "why rent is so expensive America",
    ],
    "technology_ai": [
        "AI industry explained documentary",
        "technology failure documentary",
        "tech company collapse explained",
        "cybersecurity breach documentary",
        "internet infrastructure explained",
        "future technology explained 2026",
        "AI data center explained",
        "big tech investigation documentary",
    ],
    "history_civilization": [
        "forgotten history documentary",
        "ancient civilization mystery documentary",
        "historical disaster explained",
        "untold American history documentary",
        "rise and fall of empire documentary",
        "archaeology discovery explained",
        "medieval history story documentary",
        "history that changed the world explained",
    ],
    "science_engineering": [
        "engineering disaster documentary",
        "science mystery explained documentary",
        "space discovery explained 2026",
        "megaproject failure explained",
        "how infrastructure works documentary",
        "natural disaster science explained",
        "impossible engineering explained",
        "environmental disaster documentary",
    ],
    "geography_logistics": [
        "geography mystery explained",
        "why cities are failing explained",
        "American infrastructure documentary",
        "shipping logistics explained documentary",
        "airport system explained documentary",
        "abandoned places documentary explained",
        "border geography explained",
        "supply chain documentary explained",
    ],
    "psychology_society": [
        "psychology of modern life explained",
        "human behavior documentary",
        "why people feel lonely explained",
        "social trend explained documentary",
        "modern dating psychology explained",
        "attention economy explained",
        "workplace psychology documentary",
        "internet culture explained documentary",
    ],
    "work_career_education": [
        "job market explained America 2026",
        "why college is expensive explained",
        "career crisis documentary",
        "future of work explained documentary",
        "layoffs explained documentary",
        "student debt explained America",
        "blue collar jobs explained",
        "why wages are low explained America",
    ],
    "crime_scams_mystery": [
        "internet mystery documentary",
        "financial scam documentary explained",
        "unsolved mystery documentary 2026",
        "fraud case explained documentary",
        "dark web mystery documentary",
        "cult documentary explained",
        "heist explained documentary",
        "corporate crime documentary",
    ],
    "culture_entertainment": [
        "pop culture phenomenon explained",
        "movie industry business explained",
        "music industry documentary explained",
        "internet celebrity rise and fall",
        "sports business documentary",
        "gaming industry documentary explained",
        "brand history documentary",
        "trend that changed culture explained",
    ],
    "nature_animals": [
        "animal behavior documentary explained",
        "wildlife mystery documentary",
        "ocean mystery explained documentary",
        "extinct animal documentary",
        "nature survival story documentary",
        "ecosystem explained documentary",
        "dangerous animals documentary story",
        "strange places on earth documentary",
    ],
    "practical_lifestyle": [
        "home ownership explained America",
        "car ownership costs explained",
        "travel system explained documentary",
        "food science explained documentary",
        "everyday things explained documentary",
        "how products are made documentary",
        "design failure explained",
        "hidden cost of convenience explained",
    ],
}


TARGET_QUERY_GROUPS: dict[str, list[str]] = {
    "history_reconstruction": [
        "AI historical reconstruction documentary",
        "tour of London 1800 AI reconstruction",
        "history brought to life AI documentary",
        "entire history of a city documentary",
        "old photographs animated history documentary",
        "ancient city reconstructed with AI",
    ],
    "economic_explainers": [
        "AI bubble explained finance documentary",
        "economic crisis explained 2026 documentary",
        "finance explained simply animation",
        "global debt explained documentary",
        "why America economy 2026 explained",
        "business scam explained 2026 documentary",
    ],
    "internet_mysteries": [
        "internet mystery documentary 2026",
        "disturbing internet rabbit hole documentary",
        "online scam documentary explained",
        "dark web mystery explained documentary",
        "bizarre internet culture documentary",
        "Reddit mystery explained documentary",
    ],
    "speculative_scifi": [
        "science fiction documentary alien planet",
        "future humanity documentary AI generated",
        "alien signal documentary story",
        "space documentary black hole 4K",
        "humanity future story documentary",
        "alternate future documentary AI",
    ],
    "wildlife_documentaries": [
        "wild Amazon nature animal documentary",
        "4K wildlife documentary predators",
        "extinct animals might still be alive",
        "survival wildlife documentary Alaska",
        "dangerous animals documentary 2026",
        "wildlife mysteries documentary",
    ],
}


# Representative premises from the winning sub-angle. This pass checks whether
# the idea has real search/view activity without requiring exact-title copying.
ANGLE_QUERY_GROUPS: dict[str, list[str]] = {
    "everyday_history": [
        "how people kept food cold before refrigerators history",
        "inside New York tenement 1900 history documentary",
        "how families survived Dust Bowl documentary",
        "life before electricity history documentary",
        "what soldiers ate Civil War documentary",
        "mail before railroad America history",
        "childbirth 1900 America history documentary",
        "life before air conditioning history",
        "grocery store 1800s America history",
        "laundry before washing machines history",
        "covered wagon daily life history documentary",
        "factory worker daily life 1900 documentary",
        "New York subway workers history documentary",
        "firefighters before fire hydrants history",
        "wartime rationing daily life documentary",
        "Mississippi flood 1927 documentary",
        "first apartment buildings America history",
        "colonial medicine ordinary life documentary",
        "railway dining car history documentary",
        "Ellis Island immigrant daily life documentary",
        "public baths industrial America history",
        "small town news before radio history",
        "London Blitz shelter daily life documentary",
        "medieval bread laws bakers history",
        "ancient Roman apartment daily life",
    ],
}


@dataclass
class Video:
    query_group: str
    query: str
    video_id: str
    channel_id: str
    channel_name: str
    title: str
    views: int | None
    published_text: str
    age_days: int | None
    duration_seconds: int | None
    url: str


def fetch(url: str, retries: int = 4) -> str:
    headers = {
        "User-Agent": USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9",
        "Cookie": "CONSENT=YES+cb.20210328-17-p0.en+FX+410",
    }
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            request = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(request, timeout=35) as response:
                return response.read().decode("utf-8", errors="replace")
        except Exception as exc:  # network errors are retried with backoff
            last_error = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Failed to fetch {url}: {last_error}")


def extract_initial_data(html: str) -> dict[str, Any]:
    markers = (
        "var ytInitialData = ",
        "window[\"ytInitialData\"] = ",
        "ytInitialData = ",
    )
    decoder = json.JSONDecoder()
    for marker in markers:
        start = html.find(marker)
        if start < 0:
            continue
        start += len(marker)
        try:
            value, _ = decoder.raw_decode(html[start:])
            if isinstance(value, dict):
                return value
        except json.JSONDecodeError:
            continue
    raise ValueError("ytInitialData not found")


def walk(value: Any) -> Iterable[tuple[str, Any]]:
    if isinstance(value, dict):
        for key, child in value.items():
            yield key, child
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def text_of(value: Any) -> str:
    if not isinstance(value, dict):
        return ""
    if isinstance(value.get("simpleText"), str):
        return value["simpleText"]
    runs = value.get("runs")
    if isinstance(runs, list):
        return "".join(str(run.get("text", "")) for run in runs if isinstance(run, dict))
    return ""


def parse_views(value: str) -> int | None:
    normalized = value.lower().replace("views", "").replace("view", "").strip()
    if not normalized or normalized in {"no", "no views"}:
        return 0
    match = re.search(r"([\d,.]+)\s*([kmb])?", normalized)
    if not match:
        return None
    number = float(match.group(1).replace(",", ""))
    factor = {None: 1, "k": 1_000, "m": 1_000_000, "b": 1_000_000_000}[match.group(2)]
    return int(number * factor)


def parse_compact_number(value: str) -> int | None:
    if not value:
        return None
    return parse_views(
        value.lower()
        .replace("subscribers", "views")
        .replace("subscriber", "views")
        .replace("videos", "views")
        .replace("video", "views")
    )


def parse_duration(value: str) -> int | None:
    if not value:
        return None
    parts = value.strip().split(":")
    if not all(part.isdigit() for part in parts):
        return None
    total = 0
    for part in parts:
        total = total * 60 + int(part)
    return total


def parse_age_days(value: str) -> int | None:
    text = value.lower().replace("streamed", "").replace("premiered", "").strip()
    match = re.search(r"(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago", text)
    if not match:
        return None
    count = int(match.group(1))
    unit = match.group(2)
    return {
        "minute": 0,
        "hour": 0,
        "day": count,
        "week": count * 7,
        "month": count * 30,
        "year": count * 365,
    }[unit]


def channel_from_renderer(renderer: dict[str, Any]) -> tuple[str, str]:
    owner = renderer.get("ownerText") or renderer.get("longBylineText") or renderer.get("shortBylineText")
    name = text_of(owner)
    channel_id = ""
    if isinstance(owner, dict):
        for run in owner.get("runs", []):
            if not isinstance(run, dict):
                continue
            endpoint = run.get("navigationEndpoint", {})
            channel_id = endpoint.get("browseEndpoint", {}).get("browseId", "")
            if channel_id:
                break
    return channel_id, name


def videos_from_data(
    data: dict[str, Any],
    group: str,
    query: str,
    fallback_channel_id: str = "",
    fallback_channel_name: str = "",
) -> list[Video]:
    rows: list[Video] = []
    seen: set[str] = set()
    for key, renderer in walk(data):
        if key not in {"videoRenderer", "gridVideoRenderer", "lockupViewModel"} or not isinstance(renderer, dict):
            continue
        if key == "lockupViewModel":
            if renderer.get("contentType") != "LOCKUP_CONTENT_TYPE_VIDEO":
                continue
            video_id = renderer.get("contentId", "")
        else:
            video_id = renderer.get("videoId", "")
        if not video_id or video_id in seen:
            continue
        seen.add(video_id)
        if key == "lockupViewModel":
            channel_id, channel_name = fallback_channel_id, fallback_channel_name
            title = str(renderer.get("metadata", {}).get("lockupMetadataViewModel", {}).get("title", {}).get("content", "")).strip()
            metadata_rows = (
                renderer.get("metadata", {})
                .get("lockupMetadataViewModel", {})
                .get("metadata", {})
                .get("contentMetadataViewModel", {})
                .get("metadataRows", [])
            )
            metadata_parts: list[str] = []
            for metadata_row in metadata_rows:
                for part in metadata_row.get("metadataParts", []):
                    content = part.get("text", {}).get("content", "")
                    if content:
                        metadata_parts.append(str(content))
            views_text = next((part for part in metadata_parts if "view" in part.lower()), "")
            published = next((part for part in metadata_parts if "ago" in part.lower()), "")
            duration = ""
            overlays = renderer.get("contentImage", {}).get("thumbnailViewModel", {}).get("overlays", [])
            for overlay in overlays:
                badges = overlay.get("thumbnailBottomOverlayViewModel", {}).get("badges", [])
                for badge in badges:
                    badge_text = badge.get("thumbnailBadgeViewModel", {}).get("text", "")
                    if re.fullmatch(r"\d{1,3}:\d{2}(?::\d{2})?", str(badge_text)):
                        duration = str(badge_text)
                        break
                if duration:
                    break
        else:
            channel_id, channel_name = channel_from_renderer(renderer)
            channel_id = channel_id or fallback_channel_id
            channel_name = channel_name or fallback_channel_name
            title = text_of(renderer.get("title", {})).strip()
            views_text = text_of(renderer.get("viewCountText", {})) or text_of(renderer.get("shortViewCountText", {}))
            published = text_of(renderer.get("publishedTimeText", {}))
            duration = text_of(renderer.get("lengthText", {}))
        if not channel_id:
            continue
        rows.append(
            Video(
                query_group=group,
                query=query,
                video_id=video_id,
                channel_id=channel_id,
                channel_name=channel_name,
                title=title,
                views=parse_views(views_text),
                published_text=published,
                age_days=parse_age_days(published),
                duration_seconds=parse_duration(duration),
                url=f"https://www.youtube.com/watch?v={video_id}",
            )
        )
    return rows


def write_csv(path: Path, rows: list[dict[str, Any]], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def run_discovery(
    limit_queries: int | None = None,
    query_groups: dict[str, list[str]] | None = None,
    output_prefix: str = "",
) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    groups = query_groups or QUERY_GROUPS
    tasks = [(group, query) for group, queries in groups.items() for query in queries]
    if limit_queries:
        tasks = tasks[:limit_queries]

    all_videos: list[Video] = []
    failures: list[dict[str, str]] = []
    for index, (group, query) in enumerate(tasks, start=1):
        encoded = urllib.parse.quote_plus(query)
        # EgQIBRAB combines "This year" with "Video" in YouTube search.
        url = f"https://www.youtube.com/results?search_query={encoded}&sp=EgQIBRAB"
        try:
            data = extract_initial_data(fetch(url))
            found = videos_from_data(data, group, query)
            all_videos.extend(found)
            print(f"[{index:03d}/{len(tasks):03d}] {group}: {len(found)} videos", flush=True)
        except Exception as exc:
            failures.append({"group": group, "query": query, "error": str(exc)})
            print(f"[{index:03d}/{len(tasks):03d}] FAILED {query}: {exc}", flush=True)
        time.sleep(0.35 + random.random() * 0.25)

    deduped: dict[str, Video] = {}
    for video in all_videos:
        current = deduped.get(video.video_id)
        if current is None or (video.views or 0) > (current.views or 0):
            deduped[video.video_id] = video
    videos = list(deduped.values())
    write_csv(
        DATA_DIR / f"{output_prefix}discovered_videos.csv",
        [asdict(row) for row in videos],
        list(Video.__dataclass_fields__),
    )

    by_channel: dict[str, list[Video]] = defaultdict(list)
    for video in videos:
        by_channel[video.channel_id].append(video)
    channel_rows: list[dict[str, Any]] = []
    for channel_id, items in by_channel.items():
        recent_long = [
            item
            for item in items
            if (item.age_days is None or item.age_days <= 365)
            and (item.duration_seconds or 0) >= 480
        ]
        channel_rows.append(
            {
                "channel_id": channel_id,
                "channel_name": Counter(item.channel_name for item in items).most_common(1)[0][0],
                "query_groups": "|".join(sorted(set(item.query_group for item in items))),
                "search_video_count": len(items),
                "recent_long_count": len(recent_long),
                "max_search_views": max((item.views or 0) for item in items),
                "median_search_views": int(statistics.median([item.views or 0 for item in items])),
                "channel_url": f"https://www.youtube.com/channel/{channel_id}/videos",
            }
        )
    channel_rows.sort(key=lambda row: (row["max_search_views"], row["recent_long_count"]), reverse=True)
    write_csv(
        DATA_DIR / f"{output_prefix}discovered_channels.csv",
        channel_rows,
        [
            "channel_id",
            "channel_name",
            "query_groups",
            "search_video_count",
            "recent_long_count",
            "max_search_views",
            "median_search_views",
            "channel_url",
        ],
    )
    (DATA_DIR / f"{output_prefix}discovery_failures.json").write_text(
        json.dumps(failures, indent=2), encoding="utf-8"
    )
    summary = {
        "run_date": TODAY.isoformat(),
        "query_count": len(tasks),
        "query_failures": len(failures),
        "unique_videos": len(videos),
        "unique_channels": len(channel_rows),
        "recent_long_videos": sum(
            1
            for row in videos
            if (row.age_days is None or row.age_days <= 365) and (row.duration_seconds or 0) >= 480
        ),
    }
    (DATA_DIR / f"{output_prefix}discovery_summary.json").write_text(
        json.dumps(summary, indent=2), encoding="utf-8"
    )
    print(json.dumps(summary, indent=2), flush=True)


def merge_additional_discovery(source_prefix: str) -> None:
    """Union one additional discovery pass into the broad channel dataset."""
    base_path = DATA_DIR / "discovered_channels.csv"
    additional_path = DATA_DIR / f"{source_prefix}discovered_channels.csv"
    if not base_path.exists() or not additional_path.exists():
        raise FileNotFoundError(f"Run discover and {source_prefix} discovery first")

    merged: dict[str, dict[str, Any]] = {}
    with additional_path.open("r", encoding="utf-8-sig", newline="") as handle:
        additional_ids = {row["channel_id"] for row in csv.DictReader(handle)}

    for path in (base_path, additional_path):
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            for row in csv.DictReader(handle):
                channel_id = row["channel_id"]
                existing = merged.get(channel_id)
                if existing is None:
                    merged[channel_id] = dict(row)
                    continue
                groups = set(filter(None, existing["query_groups"].split("|")))
                groups.update(filter(None, row["query_groups"].split("|")))
                existing["query_groups"] = "|".join(sorted(groups))
                existing["search_video_count"] = str(
                    int(existing["search_video_count"] or 0) + int(row["search_video_count"] or 0)
                )
                existing["recent_long_count"] = str(
                    int(existing["recent_long_count"] or 0) + int(row["recent_long_count"] or 0)
                )
                existing["max_search_views"] = str(
                    max(int(existing["max_search_views"] or 0), int(row["max_search_views"] or 0))
                )
                existing["median_search_views"] = str(
                    max(int(existing["median_search_views"] or 0), int(row["median_search_views"] or 0))
                )

    rows = list(merged.values())
    rows.sort(
        key=lambda row: (int(row["max_search_views"] or 0), int(row["recent_long_count"] or 0)),
        reverse=True,
    )
    fields = [
        "channel_id",
        "channel_name",
        "query_groups",
        "search_video_count",
        "recent_long_count",
        "max_search_views",
        "median_search_views",
        "channel_url",
    ]
    write_csv(base_path, rows, fields)
    summary = {
        "run_date": TODAY.isoformat(),
        "merged_unique_channels": len(rows),
        "additional_source": source_prefix.rstrip("_"),
        "additional_source_channels": len(additional_ids),
        "additional_channels_in_merged_set": sum(1 for row in rows if row["channel_id"] in additional_ids),
    }
    (DATA_DIR / f"merged_{source_prefix}discovery_summary.json").write_text(
        json.dumps(summary, indent=2), encoding="utf-8"
    )
    print(json.dumps(summary, indent=2), flush=True)


def regex_first(pattern: str, html: str) -> str:
    match = re.search(pattern, html, flags=re.IGNORECASE)
    if not match:
        return ""
    # JSON string decoding handles escaped unicode and punctuation safely.
    try:
        return json.loads(f'"{match.group(1)}"')
    except (json.JSONDecodeError, TypeError):
        return match.group(1)


def parse_joined_date(value: str) -> str:
    cleaned = value.replace("Joined", "").strip()
    for fmt in ("%b %d, %Y", "%b %Y", "%d %b %Y"):
        try:
            return datetime.strptime(cleaned, fmt).date().isoformat()
        except ValueError:
            continue
    return ""


def run_enrich_about(min_search_views: int = 50_000, limit_channels: int | None = None) -> None:
    source = DATA_DIR / "discovered_channels.csv"
    if not source.exists():
        raise FileNotFoundError("Run discover first")
    with source.open("r", encoding="utf-8-sig", newline="") as handle:
        candidates = [
            row
            for row in csv.DictReader(handle)
            if int(row["max_search_views"] or 0) >= min_search_views
            and int(row["recent_long_count"] or 0) >= 1
        ]
    if limit_channels:
        candidates = candidates[:limit_channels]

    output = DATA_DIR / "channel_about.csv"
    checkpoint = DATA_DIR / "channel_about_checkpoint.jsonl"
    existing: dict[str, dict[str, Any]] = {}
    if output.exists() and not limit_channels:
        with output.open("r", encoding="utf-8-sig", newline="") as handle:
            existing = {row["channel_id"]: row for row in csv.DictReader(handle)}

    if checkpoint.exists() and not limit_channels:
        with checkpoint.open("r", encoding="utf-8") as handle:
            for line in handle:
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if row.get("about_status") == "ok" and row.get("channel_id"):
                    existing[row["channel_id"]] = row

    rows: list[dict[str, Any]] = list(existing.values()) if not limit_channels else []
    failures: list[dict[str, str]] = []

    pending: list[dict[str, str]] = []
    for candidate in candidates:
        channel_id = candidate["channel_id"]
        if channel_id in existing:
            continue

        pending.append(candidate)

    def enrich_one(candidate: dict[str, str]) -> dict[str, Any]:
        channel_id = candidate["channel_id"]
        url = f"https://www.youtube.com/channel/{channel_id}/about"
        time.sleep(0.15 + random.random() * 0.2)
        html = fetch(url, retries=2)
        subscriber_text = regex_first(r'"subscriberCountText":"([^"]*)"', html)
        total_views_text = regex_first(r'"viewCountText":"([^"]*views)"', html)
        joined_text = regex_first(r'"joinedDateText":\{"content":"([^"]*)"', html)
        video_count_text = regex_first(r'"videoCountText":"([^"]*)"', html)
        canonical = regex_first(r'"canonicalChannelUrl":"([^"]*)"', html)
        country = regex_first(r'"country":"([^"]*)"', html)
        return {
            **candidate,
            "subscriber_text": subscriber_text,
            "subscribers": parse_compact_number(subscriber_text),
            "total_views_text": total_views_text,
            "total_views": parse_views(total_views_text),
            "joined_text": joined_text,
            "joined_date": parse_joined_date(joined_text),
            "video_count_text": video_count_text,
            "video_count": parse_compact_number(video_count_text),
            "country": country,
            "canonical_url": canonical or f"https://www.youtube.com/channel/{channel_id}",
            "about_status": "ok",
        }

    completed = len(candidates) - len(pending)
    if completed:
        print(f"cached {completed}/{len(candidates)} channel pages", flush=True)
    checkpoint.parent.mkdir(parents=True, exist_ok=True)
    checkpoint_handle = checkpoint.open("a", encoding="utf-8") if not limit_channels else None
    with ThreadPoolExecutor(max_workers=3) as executor:
        future_map = {executor.submit(enrich_one, candidate): candidate for candidate in pending}
        for future in as_completed(future_map):
            candidate = future_map[future]
            completed += 1
            try:
                row = future.result()
                rows.append(row)
                if checkpoint_handle:
                    checkpoint_handle.write(json.dumps(row, ensure_ascii=False) + "\n")
                    checkpoint_handle.flush()
                print(
                    f"[{completed:03d}/{len(candidates):03d}] {candidate['channel_name']}: "
                    f"{row.get('subscriber_text') or '?'}; {row.get('joined_text') or '?'}",
                    flush=True,
                )
            except Exception as exc:
                failures.append(
                    {
                        "channel_id": candidate["channel_id"],
                        "channel_name": candidate["channel_name"],
                        "error": str(exc),
                    }
                )
                rows.append({**candidate, "about_status": "failed"})
                print(f"[{completed:03d}/{len(candidates):03d}] FAILED {candidate['channel_name']}: {exc}", flush=True)
    if checkpoint_handle:
        checkpoint_handle.close()

    fields = [
        "channel_id",
        "channel_name",
        "query_groups",
        "search_video_count",
        "recent_long_count",
        "max_search_views",
        "median_search_views",
        "channel_url",
        "subscriber_text",
        "subscribers",
        "total_views_text",
        "total_views",
        "joined_text",
        "joined_date",
        "video_count_text",
        "video_count",
        "country",
        "canonical_url",
        "about_status",
    ]
    write_csv(output, rows, fields)
    (DATA_DIR / "about_failures.json").write_text(json.dumps(failures, indent=2), encoding="utf-8")
    summary = {
        "run_date": TODAY.isoformat(),
        "candidate_channels": len(candidates),
        "successful_about_pages": sum(1 for row in rows if row.get("about_status") == "ok"),
        "failures": len(failures),
        "joined_2025_or_later": sum(
            1 for row in rows if str(row.get("joined_date", "")) >= "2025-01-01"
        ),
        "joined_2026": sum(
            1 for row in rows if str(row.get("joined_date", "")) >= "2026-01-01"
        ),
    }
    (DATA_DIR / "about_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2), flush=True)


def load_recent_about_candidates(
    joined_after: str = "2025-01-01", max_subscribers: int = 750_000
) -> list[dict[str, Any]]:
    combined: dict[str, dict[str, Any]] = {}
    about_csv = DATA_DIR / "channel_about.csv"
    if about_csv.exists():
        with about_csv.open("r", encoding="utf-8-sig", newline="") as handle:
            for row in csv.DictReader(handle):
                if row.get("about_status") == "ok":
                    combined[row["channel_id"]] = row
    checkpoint = DATA_DIR / "channel_about_checkpoint.jsonl"
    if checkpoint.exists():
        with checkpoint.open("r", encoding="utf-8") as handle:
            for line in handle:
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if row.get("about_status") == "ok":
                    combined[row["channel_id"]] = row
    rows = [
        row
        for row in combined.values()
        if str(row.get("joined_date", "")) >= joined_after
        and int(row.get("subscribers") or 0) <= max_subscribers
    ]
    rows.sort(key=lambda row: (str(row.get("joined_date", "")), int(row.get("max_search_views") or 0)), reverse=True)
    return rows


def run_enrich_videos(
    joined_after: str = "2025-01-01",
    max_subscribers: int = 750_000,
    limit_channels: int | None = None,
    refresh: bool = False,
) -> None:
    candidates = load_recent_about_candidates(joined_after, max_subscribers)
    if limit_channels:
        candidates = candidates[:limit_channels]
    all_videos: list[dict[str, Any]] = []
    metrics: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []

    cached_metrics: dict[str, dict[str, Any]] = {}
    cached_videos: dict[str, list[dict[str, Any]]] = defaultdict(list)
    metrics_path = DATA_DIR / "recent_channel_metrics.csv"
    videos_path = DATA_DIR / "recent_channel_videos.csv"
    if not refresh and not limit_channels and metrics_path.exists() and videos_path.exists():
        with metrics_path.open("r", encoding="utf-8-sig", newline="") as handle:
            cached_metrics = {
                row["channel_id"]: row
                for row in csv.DictReader(handle)
                if row.get("videos_status") == "ok"
            }
        with videos_path.open("r", encoding="utf-8-sig", newline="") as handle:
            for row in csv.DictReader(handle):
                cached_videos[row["channel_id"]].append(row)
        print(f"cached {len(cached_metrics)} channel video audits", flush=True)

    for index, candidate in enumerate(candidates, start=1):
        channel_id = candidate["channel_id"]
        if channel_id in cached_metrics:
            metrics.append({**cached_metrics[channel_id], **candidate, "videos_status": "ok"})
            for row in cached_videos.get(channel_id, []):
                all_videos.append(
                    {
                        **row,
                        "channel_name": candidate["channel_name"],
                        "joined_date": candidate.get("joined_date", ""),
                        "subscribers": candidate.get("subscribers", ""),
                        "query_groups": candidate.get("query_groups", ""),
                    }
                )
            continue
        url = f"https://www.youtube.com/channel/{channel_id}/videos"
        try:
            data = extract_initial_data(fetch(url, retries=2))
            videos = videos_from_data(
                data,
                candidate.get("query_groups", ""),
                "channel_latest",
                fallback_channel_id=channel_id,
                fallback_channel_name=candidate["channel_name"],
            )
            # Channel pages sometimes repeat shelf items; keep only this channel.
            videos = [video for video in videos if video.channel_id == channel_id]
            for position, video in enumerate(videos, start=1):
                all_videos.append(
                    {
                        "channel_id": channel_id,
                        "channel_name": candidate["channel_name"],
                        "joined_date": candidate.get("joined_date", ""),
                        "subscribers": candidate.get("subscribers", ""),
                        "query_groups": candidate.get("query_groups", ""),
                        "position_latest": position,
                        **asdict(video),
                    }
                )
            long_videos = [video for video in videos if (video.duration_seconds or 0) >= 480]
            latest_10 = long_videos[:10]
            latest_20 = long_videos[:20]
            values_10 = [video.views or 0 for video in latest_10]
            values_20 = [video.views or 0 for video in latest_20]
            metrics.append(
                {
                    **candidate,
                    "extracted_videos": len(videos),
                    "extracted_long_videos": len(long_videos),
                    "median_latest_10": int(statistics.median(values_10)) if values_10 else 0,
                    "median_latest_20": int(statistics.median(values_20)) if values_20 else 0,
                    "max_latest_20": max(values_20) if values_20 else 0,
                    "latest_20_over_10k": sum(value >= 10_000 for value in values_20),
                    "latest_20_over_50k": sum(value >= 50_000 for value in values_20),
                    "latest_20_over_100k": sum(value >= 100_000 for value in values_20),
                    "latest_20_over_1m": sum(value >= 1_000_000 for value in values_20),
                    "latest_20_zero_or_missing": sum(value <= 0 for value in values_20),
                    "views_to_subs_median_10": round(
                        (statistics.median(values_10) / int(candidate.get("subscribers") or 1)), 4
                    )
                    if values_10
                    else 0,
                    "videos_status": "ok",
                }
            )
            print(
                f"[{index:03d}/{len(candidates):03d}] {candidate['channel_name']}: "
                f"{len(long_videos)} long; median10={int(statistics.median(values_10)) if values_10 else 0}",
                flush=True,
            )
        except Exception as exc:
            failures.append({"channel_id": channel_id, "channel_name": candidate["channel_name"], "error": str(exc)})
            metrics.append({**candidate, "videos_status": "failed"})
            print(f"[{index:03d}/{len(candidates):03d}] FAILED {candidate['channel_name']}: {exc}", flush=True)
        time.sleep(0.5 + random.random() * 0.4)

    video_fields = [
        "channel_id",
        "channel_name",
        "joined_date",
        "subscribers",
        "query_groups",
        "position_latest",
        "query_group",
        "query",
        "video_id",
        "title",
        "views",
        "published_text",
        "age_days",
        "duration_seconds",
        "url",
    ]
    metric_fields = [
        "channel_id",
        "channel_name",
        "query_groups",
        "joined_date",
        "subscribers",
        "video_count",
        "max_search_views",
        "extracted_videos",
        "extracted_long_videos",
        "median_latest_10",
        "median_latest_20",
        "max_latest_20",
        "latest_20_over_10k",
        "latest_20_over_50k",
        "latest_20_over_100k",
        "latest_20_over_1m",
        "latest_20_zero_or_missing",
        "views_to_subs_median_10",
        "country",
        "canonical_url",
        "videos_status",
    ]
    write_csv(DATA_DIR / "recent_channel_videos.csv", all_videos, video_fields)
    write_csv(DATA_DIR / "recent_channel_metrics.csv", metrics, metric_fields)
    (DATA_DIR / "video_audit_failures.json").write_text(json.dumps(failures, indent=2), encoding="utf-8")
    summary = {
        "run_date": TODAY.isoformat(),
        "candidate_channels": len(candidates),
        "successful_video_pages": sum(1 for row in metrics if row.get("videos_status") == "ok"),
        "failures": len(failures),
        "channels_median10_over_10k": sum(int(row.get("median_latest_10") or 0) >= 10_000 for row in metrics),
        "channels_median10_over_50k": sum(int(row.get("median_latest_10") or 0) >= 50_000 for row in metrics),
    }
    (DATA_DIR / "video_audit_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2), flush=True)


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "phase",
        choices=[
            "discover",
            "target-discover",
            "angle-discover",
            "merge-targeted",
            "merge-angle",
            "enrich-about",
            "enrich-videos",
        ],
    )
    parser.add_argument("--limit-queries", type=int)
    parser.add_argument("--limit-channels", type=int)
    parser.add_argument("--min-search-views", type=int, default=50_000)
    parser.add_argument("--joined-after", default="2025-01-01")
    parser.add_argument("--max-subscribers", type=int, default=750_000)
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    if args.phase == "discover":
        run_discovery(args.limit_queries)
    elif args.phase == "target-discover":
        run_discovery(args.limit_queries, TARGET_QUERY_GROUPS, "targeted_")
    elif args.phase == "angle-discover":
        run_discovery(args.limit_queries, ANGLE_QUERY_GROUPS, "angle_")
    elif args.phase == "merge-targeted":
        merge_additional_discovery("targeted_")
    elif args.phase == "merge-angle":
        merge_additional_discovery("angle_")
    elif args.phase == "enrich-about":
        run_enrich_about(args.min_search_views, args.limit_channels)
    elif args.phase == "enrich-videos":
        run_enrich_videos(args.joined_after, args.max_subscribers, args.limit_channels, args.refresh)


if __name__ == "__main__":
    main()
