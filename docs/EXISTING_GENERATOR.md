# Existing Infinity Phi educational generator — discovery notes

**Status: not locatable from this repository.**

`www-infinity4/EduPhi` was created empty (README only). The Infinity Phi
orange-card / yellow-word website generator is therefore not present here, and
no file or function names can be honestly documented. Nothing in Infinity Phi
was modified or removed.

## What to do in the Infinity Phi repo (before deleting anything)
Search for: `orange` card styles, click handlers on highlighted/yellow spans,
functions that create cards from a clicked word, and the HTML-page generator.
Record each file/function below, and check dynamic/indirect use (string-built
`import()`, `eval`, inline `onclick`, Worker routes, service-worker caches)
before removing any old code.

| Responsibility | File | Function |
|---|---|---|
| orange card render | _TBD_ | _TBD_ |
| yellow-word click -> new card | _TBD_ | _TBD_ |
| website/page generation | _TBD_ | _TBD_ |

## How EduPhi plugs it in
`public/core.js` takes a pluggable generator: `async ({project,parent,word,color,steering}) => {title, body, terms, sources}`
and the page builder is `buildEducationalPage(project)`. Point `window.EDUPHI_CONFIG.generateUrl`
at the Infinity Phi generation endpoint (POST, same shape) to reuse it. Without it, a local
scaffold generator is used: it produces structure and guiding questions for each color,
**not** factual claims, and its sources are search pointers marked `kind: "search"`.
