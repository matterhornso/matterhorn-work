# Vendored shadcn stylesheet

`shadcn-tailwind.css` is an unmodified copy of `dist/tailwind.css` from the published **shadcn 4.6.0** npm package, MIT licensed; see `shadcn-LICENSE.md`.

- Upstream: https://github.com/shadcn-ui/ui/tree/main/packages/shadcn
- Package artifact: https://registry.npmjs.org/shadcn/-/shadcn-4.6.0.tgz
- SHA-256 of the stylesheet: `146941ac3ff65496fdf1cb306e697255328e4dadc7c105d66e36bb031b00f6d6`

The app only needed this stylesheet, not the shadcn code-generation CLI and its dependency graph. Keeping the exact utilities locally preserves accordion animations, component state variants and scrollbar behavior without shipping/installing that unused CLI. Shared components still live in the existing component library; this is not a replacement design system.

Updates must preserve attribution, compare upstream content and run the release-dependency regression and frontend build checks. Do not add the CLI back as an application dependency to update these 95 lines.
