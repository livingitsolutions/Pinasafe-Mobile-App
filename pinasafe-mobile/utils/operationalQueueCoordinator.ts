import type { OperationalCluster } from '@/types/operationalCluster';

type StateUpdater<T> = (value: T | ((current: T) => T)) => void;

interface OperationalQueueApi {
  getOperationalClusters: () => Promise<{ data?: { data?: OperationalCluster[] } }>;
}

interface OperationalQueueState {
  setClusters: StateUpdater<OperationalCluster[]>;
  setLoading: StateUpdater<boolean>;
  setError: StateUpdater<string>;
}

export class OperationalQueueCoordinator {
  private requestGeneration = 0;
  private mounted = false;

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

  private isCurrent(generation: number): boolean {
    return this.mounted && generation === this.requestGeneration;
  }
}
