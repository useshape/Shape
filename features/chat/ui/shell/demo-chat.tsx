"use client";

import { ChatMessageItem } from "../message/item";

const NOW = Date.now();

const browse = JSON.stringify({
    image: "/hero.png",
    x: 62,
    y: 48,
});

const shots = JSON.stringify({
    images: [
        { title: "Homepage", url: "/hero.png", source: "/hero.png" },
        { title: "Product", url: "/readme.png", source: "/readme.png" },
        { title: "Marks", url: "/marketing/multiwork.png", source: "/marketing/multiwork.png" },
    ],
});

function Msg({
    role,
    content,
    ago,
    generating = false,
}: {
    role: "user" | "assistant";
    content: string;
    ago: number;
    generating?: boolean;
}) {
    return (
        <ChatMessageItem
            role={role}
            content={content}
            timestamp={NOW - ago}
            isGenerating={generating}
            model={role === "assistant" ? "auto" : undefined}
        />
    );
}

export function DemoChat() {
    return (
        <div className="flex w-full min-w-0 flex-col">
            <Msg
                role="user"
                ago={8 * 60_000}
                content="Wednesday signups fell off. Can you look at the pricing page and tell me what changed?"
            />
            <Msg
                role="assistant"
                ago={7 * 60_000}
                content={`<cat>app/pricing/page.tsx</cat>
<grep query="Talk to sales">app/pricing</grep>
<web_search query="stripe status wednesday">
### Stripe status
URL: https://status.stripe.com
No incident was posted for Wednesday.
---
### Changelog
URL: https://example.com/changelog
The pricing headline changed Tuesday night.
</web_search>
<terminal_command id="demo-signups" status="completed" exit="0">
sqlite3 data/signups.db "select day, count(*) from events where week = 'this'"
Mon 120
Tue 134
Wed 71
</terminal_command>

No payments incident. The headline was swapped Tuesday night, from “Start free” to “Talk to sales.” I opened the page to check the button.

<browse_session id="demo" status="stopped" url="https://example.com/pricing" title="Pricing">${browse}</browse_session>

The only action above the fold is Book a call.`}
            />
            <Msg role="user" ago={5 * 60_000} content="How bad is the rest of the week?" />
            <Msg
                role="assistant"
                ago={4 * 60_000}
                content={`Wednesday is the hole. Friday is still the best day.

| Day | Signups | Checkout |
| --- | --- | --- |
| Mon | 120 | 18% |
| Tue | 134 | 17% |
| Wed | 71 | 9% |
| Thu | 128 | 16% |
| Fri | 151 | 21% |

I saved the extract.

<sent_file name="signups.csv" type="text/csv" title="This week">Day,Signups,Checkout
Mon,120,18%
Tue,134,17%
Wed,71,9%
Thu,128,16%
Fri,151,21%
</sent_file>`}
            />
            <Msg role="user" ago={3 * 60_000} content="Walk the page as a new buyer and tell me if that headline is the problem." />
            <Msg
                role="assistant"
                ago={2 * 60_000}
                content={`Maya got stuck on the same button.

A second pass agrees. The visit still reaches pricing, then dies on the call-to-action.

<review_debate model="auto" status="done"></review_debate>`}
            />
            <Msg role="user" ago={90_000} content="Start free. Use last Friday’s frames as the reference for the still." />
            <Msg
                role="assistant"
                ago={60_000}
                content={`<edit file="app/pricing/page.tsx"><original>Talk to sales</original><replacement>Start free</replacement></edit>

Headline is back. These are the frames from Friday. I’ll match that crop.

<shown_images>${shots}</shown_images>

<todos title="Follow up">
<todo id="1" status="done">Check the pricing page</todo>
<todo id="2" status="done">Restore the headline</todo>
<todo id="3" status="active">Make the Friday still</todo>
</todos>`}
            />
            <Msg role="user" ago={40_000} content="Also check git, the plugin, and have a thread draft the still." />
            <Msg
                role="assistant"
                ago={30_000}
                content={`<think>The headline is the only change that lines up with Wednesday.</think>
<search query="Start free">app/pricing</search>
<ls>app/pricing</ls>
<git_operation op="diff" status="completed">[file] app/pricing/page.tsx
@@ -12,7 +12,7 @@
-  Talk to sales
+  Start free
</git_operation>
<web_visit url="https://example.com/pricing" host="example.com" title="Pricing" />
<plugin_call id="demo-plugin" toolkit="stripe" slug="list_prices" label="List prices" status="ok">Three prices, the free one is still live.</plugin_call>
<plugin_connect toolkit="stripe" name="Stripe" />
<subagent_ref id="thread-demo" agent="Friday still" task="Match the Friday crop" status="running" />
<plan title="Put the free start back">
<step status="done">Confirm the headline</step>
<step status="active">Ship the still</step>
</plan>
<plan_saved path="plans/pricing.md" title="Pricing fix">Restore Start free, then match Friday's crop.</plan_saved>
<generated_svg prompt="Start free mark">data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='12' fill='%23111'/%3E%3C/svg%3E</generated_svg>
<generated_audio prompt="A short tone" name="tone.wav">data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=</generated_audio>
<inspect_runtime url="https://example.com/pricing" kind="page" status="completed">Headline is Talk to sales.</inspect_runtime>`}
            />
            <Msg
                role="assistant"
                ago={5_000}
                content={`<generated_image prompt="Friday campaign still">/hero.png</generated_image>`}
            />
        </div>
    );
}
