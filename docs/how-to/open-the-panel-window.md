# Open the panel window

The plugin serves the panel as an ordinary page on your app's own dev server, at `/__runespect/`.
You need `runespect()` in the Vite config ([Getting started](../tutorials/getting-started.md#2-add-the-plugin)).

```
app:      http://localhost:5173/
devtools: http://localhost:5173/__runespect/
```

There is no extension and no extra port: the app and the panel talk over Vite's HMR channel, so it
also works over https.

## Under a Vite `base`

The panel moves with the app: `base: '/app/'` serves it at `/app/__runespect/`.

## With several pages open

Every page on the dev server reaches the same panel window: a second tab, another route, an island
from a separate bundle. The panel follows one page at a time, and its status chip names it. When
more than one page has answered, the chip becomes a picker.

To open the panel for a particular page, name its path:

```
http://localhost:5173/__runespect/?source=/some/path
```

That beats the page the panel followed last, which is what it picks when you name none. Until that
page answers, the panel shows no other page, so the other tabs stay as they are.

## Over the network

With `vite --host`, anyone who can open the app on your network can also open its panel and edit
its state. The dev server already serves them your source; see
[Architecture](../explanation/architecture.md#who-can-talk-to-the-agent) for what an edit can and
cannot do.
