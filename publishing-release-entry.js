// Named RPC entrypoints, not the public Publishing Worker HTTP entry.
// Separate protected deployment must use this file as main AND configure
// Books/Mall service bindings to their distinct entrypoint names. Default
// Publishing HTTP app is retained unchanged.
import { WorkerEntrypoint } from 'cloudflare:workers';
import publisherWorker from './publishing-worker.js';
import { verifyBoundPublisherRelease } from './publishing/human/publisher-release-rpc-service.js';

export default publisherWorker;

// Bind Books Worker to entrypoint BooksPublisherReleaseGate only.
export class BooksPublisherReleaseGate extends WorkerEntrypoint {
  async verifyPublicRelease(request){
    return verifyBoundPublisherRelease(this.env,'books',request,new Date().toISOString());
  }
}

// Bind Mall Worker to entrypoint MallPublisherReleaseGate only.
export class MallPublisherReleaseGate extends WorkerEntrypoint {
  async verifyPublicRelease(request){
    return verifyBoundPublisherRelease(this.env,'ekodimall',request,new Date().toISOString());
  }
}
