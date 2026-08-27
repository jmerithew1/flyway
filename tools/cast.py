"""Screencast helper: forces compositor frames in headless and saves them."""
import asyncio, base64, os, json

class Cast:
    def __init__(self, ctx, page, outdir, prefix):
        self.ctx, self.page, self.outdir, self.prefix = ctx, page, outdir, prefix
        self.frames = []
        self.cdp = None
        self.n = 0
        os.makedirs(outdir, exist_ok=True)

    async def start(self, quality=85, every=1, maxw=1280, maxh=800):
        self.cdp = await self.ctx.new_cdp_session(self.page)
        def on_frame(ev):
            self.frames.append(ev['data'])
            asyncio.ensure_future(self._ack(ev['sessionId']))
        self.cdp.on("Page.screencastFrame", on_frame)
        await self.cdp.send("Page.startScreencast", {
            "format": "jpeg", "quality": quality, "everyNthFrame": every,
            "maxWidth": maxw, "maxHeight": maxh})

    async def _ack(self, sid):
        try: await self.cdp.send("Page.screencastFrameAck", {"sessionId": sid})
        except Exception: pass

    def mark(self):
        return len(self.frames)

    async def stop(self):
        try: await self.cdp.send("Page.stopScreencast")
        except Exception: pass

    def save(self, start=0, end=None, step=1, tag=""):
        end = len(self.frames) if end is None else end
        paths = []
        for i in range(start, end, step):
            p = os.path.join(self.outdir, f"{self.prefix}{tag}_{i:03d}.jpg")
            open(p, 'wb').write(base64.b64decode(self.frames[i]))
            paths.append(p)
        return paths
