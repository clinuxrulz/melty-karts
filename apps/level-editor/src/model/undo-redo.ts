import { createSignal, Signal } from "solid-js";
import { Command } from "./commands";

export class UndoRedoManager {
  private _undoStack: Command[] = [];
  private _redoStack: Command[] = [];
  private _hasUndo: Signal<boolean> = createSignal(false);
  private _hasRedo: Signal<boolean> = createSignal(false);
  private _performCommand: (command: Command) => Command;

  constructor(performCommand: (command: Command) => Command) {
    this._performCommand = performCommand;
  }

  pushUndo(command: Command) {
    this._undoStack.push(command);
    this._hasUndo[1](this._undoStack.length !== 0);
  }

  pushRedo(command: Command) {
    this._redoStack.push(command);
    this._hasRedo[1](this._redoStack.length !== 0);
  }

  undo() {
    let command = this._undoStack.pop();
    if (command === undefined) {
      return;
    }
    let command2 = this._performCommand(command);
    this._redoStack.push(command2);
    this._hasUndo[1](this._undoStack.length !== 0);
    this._hasRedo[1](this._redoStack.length !== 0);
  }

  redo() {
    let command = this._redoStack.pop();
    if (command === undefined) {
      return;
    }
    let command2 = this._performCommand(command);
    this._undoStack.push(command2);
    this._hasUndo[1](this._undoStack.length !== 0);
    this._hasRedo[1](this._redoStack.length !== 0);
  }
}
