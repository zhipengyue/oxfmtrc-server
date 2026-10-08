import { Injectable } from '@nestjs/common';
import { Observable, Subject, filter, map } from 'rxjs';

export interface PageUpdatedEvent {
  type: 'page-updated';
  appId: string;
  pageId: string;
  revision: number;
  updatedAt: string;
  updatedBy: string;
  updatedByPhone?: string;
}

@Injectable()
export class CollabEventsService {
  private readonly bus = new Subject<PageUpdatedEvent>();

  publishPageUpdated(event: PageUpdatedEvent): void {
    this.bus.next(event);
  }

  subscribeApp(appId: string): Observable<MessageEvent> {
    return this.bus.pipe(
      filter((event) => event.appId === appId),
      map(
        (event) =>
          ({
            data: event,
          }) as MessageEvent,
      ),
    );
  }
}
