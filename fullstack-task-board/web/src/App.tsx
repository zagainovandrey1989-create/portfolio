import { useEffect, useState } from 'react';
import { api } from './api';
import { BoardView } from './components/BoardView';
import { NewBoardForm } from './components/NewBoardForm';
import type { Board } from './types';

function readBoardIdFromUrl(): number | null {
  const raw = new URLSearchParams(window.location.search).get('board');
  const id = raw ? Number(raw) : NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
}

function writeBoardIdToUrl(id: number) {
  const url = new URL(window.location.href);
  url.searchParams.set('board', String(id));
  window.history.replaceState(null, '', url);
}

export function App() {
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(readBoardIdFromUrl);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creatingBoard, setCreatingBoard] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .listBoards(controller.signal)
      .then((list) => {
        setBoards(list);
        setSelectedId((current) => (current && list.some((b) => b.id === current) ? current : (list[0]?.id ?? null)));
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setLoadError(err instanceof Error ? err.message : 'Failed to load boards');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (selectedId) writeBoardIdToUrl(selectedId);
  }, [selectedId]);

  const handleCreateBoard = async (name: string) => {
    const board = await api.createBoard(name);
    setBoards((current) => [...(current ?? []), board]);
    setSelectedId(board.id);
    setCreatingBoard(false);
  };

  const selectedBoard = boards?.find((board) => board.id === selectedId) ?? null;

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-header__title">
          <span className="logo" aria-hidden="true" />
          Task Board
        </h1>
        {boards && boards.length > 0 && (
          <div className="app-header__boards">
            <label htmlFor="board-select">Board</label>
            <select
              id="board-select"
              value={selectedId ?? ''}
              onChange={(event) => setSelectedId(Number(event.target.value))}
              data-testid="board-select"
            >
              {boards.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.name}
                </option>
              ))}
            </select>
            {creatingBoard ? (
              <NewBoardForm onCreate={handleCreateBoard} onCancel={() => setCreatingBoard(false)} autoFocus />
            ) : (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setCreatingBoard(true)}
                data-testid="new-board-button"
              >
                New board
              </button>
            )}
          </div>
        )}
      </header>

      {loadError && (
        <div className="banner banner--error" role="alert" data-testid="load-error">
          {loadError}
        </div>
      )}

      {!boards && !loadError && (
        <p className="status-text" role="status">
          Loading boards…
        </p>
      )}

      {boards && boards.length === 0 && (
        <section className="empty-state" aria-labelledby="empty-heading" data-testid="empty-state">
          <h2 id="empty-heading">Create your first board</h2>
          <p>Boards group tasks into To do, In progress and Done columns.</p>
          <NewBoardForm onCreate={handleCreateBoard} autoFocus />
        </section>
      )}

      {selectedBoard && <BoardView key={selectedBoard.id} board={selectedBoard} />}

      <footer className="app-footer">Task Board &middot; Andrei Zagainov</footer>
    </div>
  );
}
