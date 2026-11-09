# Shape docs

This folder is the only docs source. Mintlify publishes it, and the website runs Mintlify against this path instead of keeping a second copy.

```bash
# from shape/
npx --yes mint@4.2.1184 dev --port 3333 --no-open
```

From the website repo, `npm run docs` and `npm run dev` use `../shape/docs`.
