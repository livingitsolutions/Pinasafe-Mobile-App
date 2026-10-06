import type { OperationalCluster } from '@/types/operationalCluster';

type StateUpdater<T> = (value: T | ((current: T) => T)) => void;

interface OperationalQueueApi {
  getOperationalClusters: () => Promise<{ data?: { data?: OperationalCluster[] } }>;
  acknowledgeOperationalIncident: (operationalId: string) => Promise<unknown>;
}

interface OperationalQueueState {
  setClusters: StateUpdater<OperationalCluster[]>;
  setLoading: StateUpdater<boolean>;
  setError: StateUpdater<string>;
  setAcknowledgingIds: StateUpdater<Set<string>>;
  setAcknowledgementErrors: StateUpdater<Record<string, string>>;
}

export class OperationalQueueCoordinator {
  private requestGeneration = 0;
  private mounted = false;
  private acknowledgementsInFlight = new Set<string>();

  constructor(
    private readonly api: OperationalQueueApi,
    private readonly state: OperationalQueueState,
  ) {}

  activate(): void {
    this.mounted = true;
  }

  dispose(): void {
    this.mounted = false;
    this.requestGeneration++;
    this.acknowledgementsInFlight.clear();
  }

  async load(): Promise<void> {
    if (!this.mounted) return;
    const generation = ++this.requestGeneration;
    this.state.setLoading(true);
    this.state.setError('');

    try {
      const response = await this.api.getOperationalClusters();
      if (!this.isCurrent(generation)) return;
      this.state.setClusters(Array.isArray(response.data?.data) ? response.data.data : []);
      this.state.setError('');
    } catch {
      if (!this.isCurrent(generation)) return;
      this.state.setError('Operational incidents could not be loaded.');
    } finally {
      if (this.isCurrent(generation)) this.state.setLoading(false);
    }
  }

  async acknowledge(operationalId: string): Promise<void> {
    if (!this.mounted || this.acknowledgementsInFlight.has(operationalId)) return;
    this.acknowledgementsInFlight.add(operationalId);
    this.state.setAcknowledgingIds(current => new Set(current).add(operationalId));
    this.state.setAcknowledgementErrors(current => {
      const next = { ...current };
      delete next[operationalId];
      return next;
    });

    try {
      await this.api.acknowledgeOperationalIncident(operationalId);
      if (!this.mounted) return;

      // Acknowledgement is newer authoritative state than any poll already in flight.
      this.requestGeneration++;
      this.state.setClusters(current => current.map(cluster => cluster.operationalId === operationalId
        ? { ...cluster, acknowledged: true }
        : cluster));
      this.state.setLoading(false);
    } catch {
      if (!this.mounted) return;
      this.state.setAcknowledgementErrors(current => ({
        ...current,
        [operationalId]: 'Acknowledgement failed. The alert remains active; retry when ready.',
      }));
    } finally {
      this.acknowledgementsInFlight.delete(operationalId);
      if (this.mounted) {
        this.state.setAcknowledgingIds(current => {
          const next = new Set(current);
          next.delete(operationalId);
          return next;
        });
      }
    }
  }

  private isCurrent(generation: number): boolean {
    return this.mounted && generation === this.requestGeneration;
  }
}
