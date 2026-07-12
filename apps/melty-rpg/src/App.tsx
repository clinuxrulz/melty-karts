import { Component } from "solid-js";
import { askYesNo, awaitActionPress, compile, delay, dialog, Fn, If, obtainVar } from "./story-lang";

const App: Component = () => {
  console.log(introSequenceModule);
  return (
    <>

    </>
  );
};

let introSequence = Fn(() => {
  delay(1000);
  dialog("Melty: Boy. Morning already?");
  awaitActionPress();
  dialog("Melty: Time to get ready for the day! Who knows what adventures today holds!");
  awaitActionPress();
  // . . .
  dialog("Get out of bed?");
  let r = obtainVar<boolean>("GameRes", "yesNoVal");
  r.assign(askYesNo());
  If(r, () => {
    // . . .
  }).Else(() => {
    // . . .
  });
});

let introSequenceCode = compile(introSequence([])).code.join("\r\n");
let introSequenceBlob = new Blob([ introSequenceCode, ], { type: "text/javascript", });
let introSequenceUrl = URL.createObjectURL(introSequenceBlob);
let introSequenceModule = await import(/* @vite-ignore */introSequenceUrl);

export default App;
