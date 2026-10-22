# Getting the most out of your computer (Edge / Chrome)

A web page cannot change your browser's flags, so these are settings you change yourself.
They matter most on laptops, where the browser may pick the weak integrated GPU, or fall
back to software rendering (very slow, and the game then looks flat).

1. **Hardware acceleration:** Edge: Settings > System and performance > "Use graphics
   acceleration when available" = ON. Chrome: Settings > System > "Use graphics acceleration
   when available" = ON. Restart the browser.
2. **Use the fast GPU (Windows):** Settings > System > Display > Graphics > add Edge
   (or Chrome) > Options > **High performance**.
3. **Flags** (type `edge://flags` or `chrome://flags` in the address bar, search the name,
   set it, then click Restart):
   - *Override software rendering list* = **Enabled**
   - *Choose ANGLE graphics backend* = **D3D11** (or D3D12 / Vulkan if listed)
   - *GPU rasterization* = **Enabled**
   - *Zero-copy rasterizer* = **Enabled**
4. **Check it worked:** open `edge://gpu`. "WebGL" should say *Hardware accelerated*. If it
   says *Software only*, the game will run poorly whatever preset you pick.
5. **Power:** plug the laptop in and set its power mode to Best performance.
6. Then pick the highest quality preset in the game's settings menu.

Flags are experimental; if something misbehaves, click "Reset all" on the flags page.
