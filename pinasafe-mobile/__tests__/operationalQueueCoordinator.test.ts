import type { OperationalCluster } from '../types/operationalCluster';
import { OperationalQueueCoordinator } from '../utils/operationalQueueCoordinator';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const incident: OperationalCluster = {
  operationalId: 'op-1',
  clusterId: 'cluster-1',
  type: 'fire',
  status: 'pending',
  location: null,
  latitude: null,
  longitude: null,
  coordinates: null,
  firstReportedAt: null,
  latestReportedAt: null,
  reportCount: 2,
  distinctReporterCount: 2,
  corroborated: true,
  acknowledged: false,
  priority: 'high',
  assignedTeams: [],
  memberReports: [],
};

function setup(initialClusters: OperationalCluster[] = [incident]) {
  const state = {
    clusters: initialClusters,
    loading: false,
    error: '',
    acknowledgingIds: new Set<string>(),
    acknowledgementErrors: {} as Record<string, string>,
  };
  const setters = {
    setClusters: jest.fn((value: OperationalCluster[] | ((current: OperationalCluster[]) => OperationalCluster[])) => {
      state.clusters = typeof value === 'function' ? value(state.clusters) : value;
    }),
    setLoading: jest.fn((value: boolean | ((current: boolean) => boolean)) => {
      state.loading = typeof value === 'function' ? value(state.loading) : value;
    }),
    setError: jest.fn((value: string | ((current: string) => string)) => {
      state.error = typeof value === 'function' ? value(state.error) : value;
    }),
    setAcknowledgingIds: jest.fn((value: Set<string> | ((current: Set<string>) => Set<string>)) => {
      state.acknowledgingIds = typeof value === 'function' ? value(state.acknowledgingIds) : value;
    }),
    setAcknowledgementErrors: jest.fn((value: Record<string, string> | ((current: Record<string, string>) => Record<string, string>)) => {
      state.acknowledgementErrors = typeof value === 'function' ? value(state.acknowledgementErrors) : value;
    }),
  };
  const api = {
    getOperationalClusters: jest.fn(),
    acknowledgeOperationalIncident: jest.fn(),
  };
  const coordinator = new OperationalQueueCoordinator(api, setters);
  coordinator.activate();
  return { state, setters, api, coordinator };
}

const response = (clusters: OperationalCluster[]) => ({ data: { data: clusters } });

describe('operational queue acknowledgement and poll coordination', () => {
  test('acknowledgement wins over an in-flight poll success and always clears loading', async () => {
    const oldPoll = deferred<ReturnType<typeof response>>();
    const ack = deferred<unknown>();
    const { state, api, coordinator } = setup();
    api.getOperationalClusters.mockReturnValue(oldPoll.promise);
    api.acknowledgeOperationalIncident.mockReturnValue(ack.promise);

    const pollPromise = coordinator.load();
    const ackPromise = coordinator.acknowledge('op-1');
    ack.resolve({});
    await ackPromise;

    expect(state.loading).toBe(false);
    expect(state.clusters[0].acknowledged).toBe(true);

    oldPoll.resolve(response([incident]));
    await pollPromise;
    expect(state.clusters[0].acknowledged).toBe(true);
    expect(state.loading).toBe(false);
  });

  test('acknowledgement wins over an in-flight poll failure without surfacing stale error', async () => {
    const oldPoll = deferred<ReturnType<typeof response>>();
    const ack = deferred<unknown>();
    const { state, api, coordinator } = setup();
    api.getOperationalClusters.mockReturnValue(oldPoll.promise);
    api.acknowledgeOperationalIncident.mockReturnValue(ack.promise);

    const pollPromise = coordinator.load();
    const ackPromise = coordinator.acknowledge('op-1');
    ack.resolve({});
    await ackPromise;
    oldPoll.reject(new Error('stale poll failure'));
    await pollPromise;

    expect(state.clusters[0].acknowledged).toBe(true);
    expect(state.error).toBe('');
    expect(state.loading).toBe(false);
  });

  test('acknowledgement applies after a newer poll has already completed', async () => {
    const ack = deferred<unknown>();
    const { state, api, coordinator } = setup();
    api.getOperationalClusters.mockResolvedValue(response([incident]));
    api.acknowledgeOperationalIncident.mockReturnValue(ack.promise);

    const ackPromise = coordinator.acknowledge('op-1');
    await coordinator.load();
    expect(state.loading).toBe(false);
    expect(state.clusters[0].acknowledged).toBe(false);

    ack.resolve({});
    await ackPromise;
    expect(state.clusters[0].acknowledged).toBe(true);
    expect(state.loading).toBe(false);
  });

  test('failed acknowledgement during poll activity stays unacknowledged and settles loading', async () => {
    const poll = deferred<ReturnType<typeof response>>();
    const ack = deferred<unknown>();
    const { state, api, coordinator } = setup();
    api.getOperationalClusters.mockReturnValue(poll.promise);
    api.acknowledgeOperationalIncident.mockReturnValue(ack.promise);

    const pollPromise = coordinator.load();
    const ackPromise = coordinator.acknowledge('op-1');
    poll.resolve(response([incident]));
    await pollPromise;
    ack.reject(new Error('ack failed'));
    await ackPromise;

    expect(state.clusters[0].acknowledged).toBe(false);
    expect(state.acknowledgementErrors['op-1']).toMatch(/retry/i);
    expect(state.loading).toBe(false);
  });

  test('rapid acknowledgement clicks issue one request and do not corrupt state', async () => {
    const ack = deferred<unknown>();
    const { state, api, coordinator } = setup();
    api.acknowledgeOperationalIncident.mockReturnValue(ack.promise);

    const first = coordinator.acknowledge('op-1');
    const second = coordinator.acknowledge('op-1');
    expect(api.acknowledgeOperationalIncident).toHaveBeenCalledTimes(1);
    expect(state.acknowledgingIds.has('op-1')).toBe(true);

    ack.resolve({});
    await Promise.all([first, second]);
    expect(state.clusters[0].acknowledged).toBe(true);
    expect(state.acknowledgingIds.has('op-1')).toBe(false);
  });

  test('unmount during acknowledgement prevents all later state updates', async () => {
    const ack = deferred<unknown>();
    const { setters, api, coordinator } = setup();
    api.acknowledgeOperationalIncident.mockReturnValue(ack.promise);
    const acknowledgement = coordinator.acknowledge('op-1');
    const stateUpdateCounts = Object.values(setters).map(setter => setter.mock.calls.length);

    coordinator.dispose();
    ack.resolve({});
    await acknowledgement;

    expect(Object.values(setters).map(setter => setter.mock.calls.length)).toEqual(stateUpdateCounts);
  });
});
