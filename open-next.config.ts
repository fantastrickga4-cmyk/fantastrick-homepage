import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// ISR(revalidate) 를 안 쓰는 앱이라 incremental cache 는 비워둔다(기본).
// 나중에 ISR 을 쓰게 되면 r2IncrementalCache 를 붙이면 된다.
export default defineCloudflareConfig({});
