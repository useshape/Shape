import marks from "./thesvg.json";

type Mark = { slug: string; variants: string[] };

const MARKS = marks as Record<string, Mark>;

/** theSVG mark. Dark variant when the glyph would disappear on a dark surface. */
function thesvgLogoUrl(toolkit: string, dark: boolean): string | null {
    const raw = toolkit.trim().toLowerCase();
    const mark = MARKS[raw.replace(/_/g, "")] ?? MARKS[raw];
    if (!mark) return null;
    const variant = dark && mark.variants.includes("dark") ? "dark" : "default";
    return `https://thesvg.org/icons/${mark.slug}/${variant}.svg`;
}

const PLUGIN_DOMAINS: Record<string, string> = {
    slack: "slack.com",
    github: "github.com",
    gitlab: "gitlab.com",
    linear: "linear.app",
    notion: "notion.so",
    notioncalendar: "notion.so",
    figma: "figma.com",
    vercel: "vercel.com",
    supabase: "supabase.com",
    stripe: "stripe.com",
    discord: "discord.com",
    jira: "atlassian.com",
    asana: "asana.com",
    clickup: "clickup.com",
    trello: "trello.com",
    monday: "monday.com",
    airtable: "airtable.com",
    hubspot: "hubspot.com",
    salesforce: "salesforce.com",
    intercom: "intercom.com",
    googledrive: "drive.google.com",
    googlecalendar: "calendar.google.com",
    googlesheets: "sheets.google.com",
    googledocs: "docs.google.com",
    dropbox: "dropbox.com",
    twitter: "x.com",
    linkedin: "linkedin.com",
    zoom: "zoom.us",
    calendly: "calendly.com",
    sentry: "sentry.io",
    datadog: "datadoghq.com",
    pagerduty: "pagerduty.com",
    shopify: "shopify.com",
    confluence: "atlassian.com",
    bitbucket: "bitbucket.org",
    firebase: "firebase.google.com",
    attio: "attio.com",
    outlook: "outlook.live.com",
    microsoftteams: "teams.microsoft.com",
    microsoft_teams: "teams.microsoft.com",
    todoist: "todoist.com",
    webflow: "webflow.com",
    cloudflare: "cloudflare.com",
    heroku: "heroku.com",
    digitalocean: "digitalocean.com",
    posthog: "posthog.com",
    mixpanel: "mixpanel.com",
    reddit: "reddit.com",
    youtube: "youtube.com",
    twilio: "twilio.com",
    sendgrid: "sendgrid.com",
    netlify: "netlify.com",
    railway: "railway.com",
    render: "render.com",
    flyio: "fly.io",
    awsamplify: "aws.amazon.com/amplify",
    framer: "framer.com",
    circleci: "circleci.com",
    browserbase: "browserbase.com",
    hackernews: "news.ycombinator.com",
    gmail: "mail.google.com",
    googlemeet: "meet.google.com",
    onedrive: "onedrive.live.com",
    one_drive: "onedrive.live.com",
    excel: "microsoft.com",
    microsoftexcel: "microsoft.com",
    miro: "miro.com",
    canva: "canva.com",
    loom: "loom.com",
    zendesk: "zendesk.com",
    mailchimp: "mailchimp.com",
    box: "box.com",
    amplitude: "amplitude.com",
    snowflake: "snowflake.com",
    mongodb: "mongodb.com",
    docker: "docker.com",
};

export function pluginLogoSrc(toolkit: string, dark: boolean, fallback?: string | null): string | null {
    return pluginLogoCandidates(toolkit, dark, fallback)[0] ?? null;
}

export function pluginLogoCandidates(toolkit: string, dark: boolean, fallback?: string | null): string[] {
    const key = toolkit.trim().toLowerCase();
    const out: string[] = [];
    const svg = thesvgLogoUrl(key, dark);
    if (svg) out.push(svg);
    if (fallback) out.push(fallback);
    const domain = PLUGIN_DOMAINS[key];
    if (domain) out.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`);
    return [...new Set(out)];
}

export function pluginLetter(name: string): string {
    return name.trim().slice(0, 1).toUpperCase() || "?";
}

/** Meta discovery tools — never force the Shape logo in workflow chips. */
export function isShapePluginMeta(_toolkit?: string, _slug?: string): boolean {
    return false;
}

export function humanizePluginActionName(slug: string, name?: string): string {
    const source = slug.includes("_") ? slug : (name || slug);
    const parts = source.split("_").filter(Boolean);
    const words = parts.length > 1 ? parts.slice(1) : parts;
    return words
        .map((w) => {
            const lower = w.toLowerCase();
            if (["id", "url", "api", "http", "sms"].includes(lower)) return lower.toUpperCase();
            return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join(" ")
        .replace(/\s*\(deprecated\)/i, "")
        .replace(/\s+Deprecated$/i, "")
        .trim() || slug;
}

/** Favicon + brand mark candidates for a custom MCP server. */
export function mcpServerBrandCandidates(name: string, url: string | undefined, dark: boolean): string[] {
    const keys: string[] = [];
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (slug) keys.push(slug);
    if (url) {
        try {
            const host = new URL(url).hostname.replace(/^www\./, "");
            const first = host.split(".")[0] ?? host;
            keys.push(first, host);
        } catch {
            /* ignore */
        }
    }
    const out: string[] = [];
    for (const key of keys) {
        out.push(...pluginLogoCandidates(key, dark));
    }
    if (url) {
        try {
            out.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(url).hostname)}&sz=64`);
        } catch {
            /* ignore */
        }
    }
    out.push("/integrations/logos/mcp.svg");
    return [...new Set(out)];
}

export function cleanPluginActionDescription(raw: string): string {
    let s = raw.replace(/\s+/g, " ").trim();
    s = s.replace(/\s*Args:\s*\{[\s\S]*$/i, "").trim();
    s = s.replace(/\{"type"\s*:\s*"object"[\s\S]*/g, "").trim();
    s = s.replace(/Deprecated\.?\s*/gi, "").trim();
    const cut = s.search(/[.!?]\s/);
    if (cut > 20 && cut < 140) s = s.slice(0, cut + 1);
    if (s.length > 140) s = `${s.slice(0, 137).trim()}…`;
    return s;
}
