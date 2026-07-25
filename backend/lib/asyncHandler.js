// Express 4 leitet Rejections aus async Route-Handlern NICHT automatisch an
// die Error-Middleware weiter -- ohne diesen Wrapper würde ein einzelner
// DB-Fehler in einem Request den ganzen Prozess crashen (unhandled rejection).
export function asyncHandler(fn) {
  return (req, res, next) => {
    try {
      Promise.resolve(fn(req, res, next)).catch(next);
    } catch (err) {
      next(err);
    }
  };
}
