/** Brand marks via Simple Icons. Prefer these over Composio’s generic/wrong logos. */
export type PluginLogoSpec = {
    slug: string;
    color: string;
    invertInDark?: boolean;
};

export const PLUGIN_LOGO_SPECS: Record<string, PluginLogoSpec> = {
    slack: { slug: "slack", color: "4A154B" },
    github: { slug: "github", color: "181717", invertInDark: true },
    gitlab: { slug: "gitlab", color: "FC6D26" },
    linear: { slug: "linear", color: "5E6AD2" },
    notion: { slug: "notion", color: "000000", invertInDark: true },
    figma: { slug: "figma", color: "F24E1E" },
    vercel: { slug: "vercel", color: "000000", invertInDark: true },
    supabase: { slug: "supabase", color: "3FCF8E" },
    stripe: { slug: "stripe", color: "635BFF" },
    discord: { slug: "discord", color: "5865F2" },
    jira: { slug: "jira", color: "0052CC" },
    asana: { slug: "asana", color: "F06A6A" },
    clickup: { slug: "clickup", color: "7B68EE" },
    trello: { slug: "trello", color: "0052CC" },
    monday: { slug: "mondaydotcom", color: "FF3D57" },
    notioncalendar: { slug: "notion", color: "000000", invertInDark: true },
    hackernews: { slug: "ycombinator", color: "FF6600" },
    airtable: { slug: "airtable", color: "18BFFF" },
    hubspot: { slug: "hubspot", color: "FF7A59" },
    salesforce: { slug: "salesforce", color: "00A1E0" },
    intercom: { slug: "intercom", color: "6AFDEF" },
    googledrive: { slug: "googledrive", color: "4285F4" },
    googlecalendar: { slug: "googlecalendar", color: "4285F4" },
    googlesheets: { slug: "googlesheets", color: "34A853" },
    googledocs: { slug: "googledocs", color: "4285F4" },
    dropbox: { slug: "dropbox", color: "0061FF" },
    twitter: { slug: "x", color: "000000", invertInDark: true },
    linkedin: { slug: "linkedin", color: "0A66C2" },
    zoom: { slug: "zoom", color: "0B5CFF" },
    calendly: { slug: "calendly", color: "006BFF" },
    sentry: { slug: "sentry", color: "362D59" },
    datadog: { slug: "datadog", color: "632CA6" },
    pagerduty: { slug: "pagerduty", color: "06AC38" },
    shopify: { slug: "shopify", color: "7AB55C" },
    confluence: { slug: "confluence", color: "172B4D" },
    bitbucket: { slug: "bitbucket", color: "0052CC" },
    firebase: { slug: "firebase", color: "FFCA28" },
    outlook: { slug: "microsoftoutlook", color: "0078D4" },
    microsoftteams: { slug: "microsoftteams", color: "6264A7" },
    microsoft_teams: { slug: "microsoftteams", color: "6264A7" },
    todoist: { slug: "todoist", color: "E44332" },
    webflow: { slug: "webflow", color: "4353FF" },
    cloudflare: { slug: "cloudflare", color: "F38020" },
    heroku: { slug: "heroku", color: "430098" },
    digitalocean: { slug: "digitalocean", color: "0080FF" },
    posthog: { slug: "posthog", color: "000000", invertInDark: true },
    mixpanel: { slug: "mixpanel", color: "7856FF" },
    reddit: { slug: "reddit", color: "FF4500" },
    youtube: { slug: "youtube", color: "FF0000" },
    twilio: { slug: "twilio", color: "F22F46" },
    sendgrid: { slug: "sendgrid", color: "1A82E2" },
    netlify: { slug: "netlify", color: "00C7B7" },
    circleci: { slug: "circleci", color: "343434", invertInDark: true },
    attio: { slug: "attio", color: "000000", invertInDark: true },
};

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
    circleci: "circleci.com",
    browserbase: "browserbase.com",
    hackernews: "news.ycombinator.com",
};

export function pluginLogoSrc(toolkit: string, dark: boolean, fallback?: string | null): string | null {
    return pluginLogoCandidates(toolkit, dark, fallback)[0] ?? null;
}

export function pluginLogoCandidates(toolkit: string, dark: boolean, fallback?: string | null): string[] {
    const key = toolkit.trim().toLowerCase();
    const out: string[] = [];
    const spec = PLUGIN_LOGO_SPECS[key];
    if (spec) {
        const color = spec.invertInDark && dark ? "ffffff" : spec.color;
        out.push(`https://cdn.simpleicons.org/${spec.slug}/${color}`);
    }
    if (fallback) out.push(fallback);
    const domain = PLUGIN_DOMAINS[key];
    if (domain) out.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`);
    return [...new Set(out)];
}

export function pluginLetter(name: string): string {
    return name.trim().slice(0, 1).toUpperCase() || "?";
}

export function isShapePluginMeta(toolkit?: string, slug?: string): boolean {
    const t = (toolkit || "").toLowerCase();
    const s = (slug || "").toLowerCase();
    return t === "plugins" || s === "plugin_list" || s === "plugin_search" || s === "plugin_tools";
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
