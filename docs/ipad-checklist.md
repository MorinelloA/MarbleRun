# iPad checklist

What only a real iPad can show. Everything else is covered by the automated tests (`README.md`, "Test it").

## Set up

On the computer, start the game on your network:

```bash
python tools/devserver.py 8321 --lan
```

Open the address it prints in Safari on the iPad (same Wi-Fi), with the iPad held sideways. For the frame-time readout in step 6, add `?debug` to the address.

Install and offline play (step 9) need the game served over HTTPS, so do that step after deploying (README, "Deploy it").

## Checks

1. **Sharp.** The board's pieces, the grid dots and the tray icons look crisp, not soft, at rest and after turning the iPad away and back.
2. **The title.** The start screen's MARBLE RUN BUILDER is in Mona Sans, black and condensed (not a plain system font). Shapes rest on its letters, and you can grab and throw them.
3. **Sound.**
   - Tap Drop marble: you hear it, and the bells and bars ring as marbles pass.
   - With the iPad set to silent (side switch, or the bell in Control Center), sound still plays on iPadOS 16.4 and later. On iPadOS 15, silent mutes it; that is expected.
   - Interrupt it: pull down Control Center and dismiss it, swipe to another app and back, or take a call. Sound comes back without reloading.
4. **Dropping into the bottom row.** Drag a Track out of the tray and let go with your finger still over the top of the tray. The piece lands in the bottom row of the board.
5. **Touch gestures.**
   - Tap a ramp: it turns.
   - Hold a ramp for about half a second: it flips to its mirror image.
   - Tap a Ding bar or a bell: it plays its next note and changes colour.
   - Hold a Ding bar: it turns.
   - Drag a piece back onto the tray: it goes, and the Undo in the message brings it back.
6. **Speed.** With `?debug`, open Round & Round and tap Drop marble until the count reads 20. The HUD's frame time stays under 8 ms.
7. **Memory.** Tap Home and then the close button 20 times in a row. Nothing slows down, and the page doesn't reload by itself.
8. **The new pieces and boards.**
   - Fair Share deals marbles alternately left and right, and both goal cups count them.
   - Melody Lane plays up the scale on the left and back down on the right.
   - In My runs, Share this board and send the link to another device; it opens the same board there.
   - On a fresh visit (or after "How to play" on the start screen), the tips appear and tick off as you do each step.
9. **Install and offline** (over HTTPS). Share, then Add to Home Screen. Open it from the icon: it fills the screen. Turn on Airplane Mode, close the app fully, and open it again: it still plays.

## If something's off

Note the step, what you expected and what happened, ideally with a screenshot or screen recording, and the iPad model and iPadOS version (Settings, General, About).
