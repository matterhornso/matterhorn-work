# Live browser acceptance — 2026-09-08

Hosted release tested: `7eab658e94a8530088d03d18ab8a6f4f433c4ce8`

Application: <https://matterhorn-desks-canary.vercel.app/>

## Results

| Check                        | Result  | Notes                                                                                                                                                 |
| ---------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Firefox 155.0.1              | Pass    | Real WebDriver run; five responsive widths, named controls, keyboard order, and visible focus passed.                                                 |
| Safari                       | Pending | `safaridriver` is installed, but Safari's **Allow remote automation** setting is disabled.                                                            |
| Chromium Lighthouse, desktop | Pass    | Performance 0.99, accessibility 1.00, best practices 1.00, SEO 1.00.                                                                                  |
| Chromium Lighthouse, mobile  | Pass    | Performance 1.00, accessibility 1.00, best practices 1.00, SEO 1.00.                                                                                  |
| Manual VoiceOver             | Pending | Automated landmarks, headings, labels, names, and focus checks pass; manual spoken-flow review still requires a user-operated VoiceOver session.      |
| Chrome DevTools live trace   | Pending | The `chrome-devtools` MCP connector is not configured on this host. Lighthouse is supporting evidence, not a substitute for the requested live trace. |

Firefox checked 320, 375, 768, 1024, and 1440 px. It found one main landmark, two headings, zero unnamed controls, zero unnamed inputs, no horizontal overflow, five distinct keyboard focus stops, and visible focus at every inspected stop.

## Reproduce

```sh
pnpm test:live-browser-acceptance
pnpm accept:live-browser -- --browser firefox --strict
pnpm accept:live-browser -- --browser safari --strict
pnpm test:lighthouse-playwright -- --url https://matterhorn-desks-canary.vercel.app/ --strict
```

Safari requires **Safari > Settings > Developer > Allow remote automation**. The harness never reads cookies, local storage, passwords, wallet data, or browser history.
