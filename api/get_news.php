<?php
// ============================================================
// FILE: api/get_news.php
// PURPOSE: Fetches live NBA news from ESPN's public API
//          Returns articles with headlines, descriptions, images
// EXAMPLE CALL: fetch('api/get_news.php?limit=8')
// ============================================================
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$limit = isset($_GET['limit']) ? min(12, max(1, intval($_GET['limit']))) : 8;

// ESPN public news endpoint — no API key required
$url = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news?limit={$limit}";

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 8,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_HTTPHEADER     => [
        'User-Agent: Mozilla/5.0 (compatible; CourtStars/1.0)',
        'Accept: application/json',
    ],
    CURLOPT_SSL_VERIFYPEER => false,
]);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr  = curl_error($ch);
curl_close($ch);

if ($response === false || $httpCode !== 200) {
    error_log("get_news.php ESPN fetch failed: HTTP {$httpCode} | cURL: {$curlErr}");
    echo json_encode(['success' => false, 'error' => 'ESPN API unavailable', 'code' => $httpCode]);
    exit;
}

$raw = json_decode($response, true);

// ── Category → fallback image map ────────────────────────────
// Used when ESPN provides no usable image. Each maps to a clearly
// basketball-related Unsplash photo relevant to the topic.
$categoryFallbacks = [
    'trade'    => 'https://images.unsplash.com/photo-1519861531473-9200262188bf?w=800&q=80',
    'injury'   => 'https://images.unsplash.com/photo-1574623452334-1e0ac2b3ccb4?w=800&q=80',
    'draft'    => 'https://images.unsplash.com/photo-1504450758481-7338eba7524a?w=800&q=80',
    'playoff'  => 'https://images.unsplash.com/photo-1518063319789-7217e6706b04?w=800&q=80',
    'final'    => 'https://images.unsplash.com/photo-1518063319789-7217e6706b04?w=800&q=80',
    'champion' => 'https://images.unsplash.com/photo-1518063319789-7217e6706b04?w=800&q=80',
    'signing'  => 'https://images.unsplash.com/photo-1519861531473-9200262188bf?w=800&q=80',
    'rumor'    => 'https://images.unsplash.com/photo-1519861531473-9200262188bf?w=800&q=80',
    'stat'     => 'https://images.unsplash.com/photo-1587280501635-68a0e82cd5ff?w=800&q=80',
    'analysis' => 'https://images.unsplash.com/photo-1587280501635-68a0e82cd5ff?w=800&q=80',
    'recap'    => 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800&q=80',
    'preview'  => 'https://images.unsplash.com/photo-1504450758481-7338eba7524a?w=800&q=80',
    'game'     => 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800&q=80',
    'score'    => 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800&q=80',
];
$defaultFallback = 'https://images.unsplash.com/photo-1504450758481-7338eba7524a?w=800&q=80';

// URL substrings that indicate a generic/unrelated ESPN image
$blockedSubstrings = ['stock', 'generic', 'placeholder', 'nba-logo', 'headshot', '/i/espn/espn_logos'];

/**
 * Pick the most relevant image from ESPN's images array.
 * Pass 1: skip stock types and blocked URL patterns, require min size.
 * Pass 2: if nothing passed, take the largest image regardless.
 */
function pickBestImage(array $images, array $blockedSubstrings): ?string {
    $best     = null;
    $bestArea = 0;

    // Pass 1 — filtered
    foreach ($images as $img) {
        if (empty($img['url'])) continue;

        $type = strtolower($img['type'] ?? '');
        $url  = strtolower($img['url']);

        if (in_array($type, ['stock', 'default', 'icon', 'sprite', 'headshot'])) continue;

        $blocked = false;
        foreach ($blockedSubstrings as $sub) {
            if (strpos($url, $sub) !== false) { $blocked = true; break; }
        }
        if ($blocked) continue;

        $w = (int)($img['width']  ?? 0);
        $h = (int)($img['height'] ?? 0);
        if ($w < 300 || $h < 150) continue; // skip tiny thumbnails

        $area = $w * $h;
        if ($area > $bestArea) { $bestArea = $area; $best = $img['url']; }
    }

    // Pass 2 — unfiltered fallback (largest wins)
    if ($best === null) {
        foreach ($images as $img) {
            if (empty($img['url'])) continue;
            $area = ((int)($img['width'] ?? 0)) * ((int)($img['height'] ?? 0));
            if ($area > $bestArea) { $bestArea = $area; $best = $img['url']; }
        }
    }

    return $best;
}

/**
 * Given a category string and headline, return the best themed fallback URL.
 */
function themedFallback(string $category, string $headline, array $map, string $default): string {
    $haystack = strtolower($category . ' ' . $headline);
    foreach ($map as $keyword => $url) {
        if (strpos($haystack, $keyword) !== false) return $url;
    }
    return $default;
}

$articles = [];

foreach (($raw['articles'] ?? []) as $art) {

    // ── Image ────────────────────────────────────────────────
    $image = pickBestImage($art['images'] ?? [], $blockedSubstrings);

    // ── Category label ────────────────────────────────────────
    $category = 'NBA';
    foreach (($art['categories'] ?? []) as $cat) {
        if (!empty($cat['description'])) {
            $category = ucwords(strtolower($cat['description']));
            break;
        }
    }

    // If ESPN gave us no usable image, use a themed Unsplash fallback
    if (empty($image)) {
        $headline = $art['headline'] ?? '';
        $image    = themedFallback($category, $headline, $categoryFallbacks, $defaultFallback);
    }

    // ── Pretty date ───────────────────────────────────────────
    $date = 'Today';
    if (!empty($art['published'])) {
        $ts   = strtotime($art['published']);
        $diff = time() - $ts;
        if ($diff < 86400)      $date = 'Today';
        elseif ($diff < 172800) $date = 'Yesterday';
        elseif ($diff < 604800) $date = ceil($diff / 86400) . ' days ago';
        else                    $date = date('M j', $ts);
    }

    $articles[] = [
        'title'    => $art['headline']    ?? 'NBA Update',
        'desc'     => $art['description'] ?? '',
        'content'  => $art['story']       ?? ($art['description'] ?? ''),
        'source'   => 'ESPN',
        'date'     => $date,
        'category' => $category,
        'image'    => $image,
        'url'      => $art['links']['web']['href'] ?? '#',
    ];
}

echo json_encode(['success' => true, 'count' => count($articles), 'data' => $articles]);
?>