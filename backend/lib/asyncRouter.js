import { Router } from 'express';
import { asyncHandler } from './asyncHandler.js';

// Router, dessen get/post/put/... jeden übergebenen Handler (inklusive
// Middleware wie requireAuth) automatisch mit asyncHandler umschließt.
// Verhindert, dass ein rejecteter Promise in irgendeiner Route den ganzen
// Prozess crasht (siehe asyncHandler.js) -- ohne dass jede Route einzeln
// eingepackt werden muss.
export function createAsyncRouter() {
  const router = Router();
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const original = router[method].bind(router);
    router[method] = (path, ...handlers) => original(path, ...handlers.map(asyncHandler));
  }
  return router;
}
