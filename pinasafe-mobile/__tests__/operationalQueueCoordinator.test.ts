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
  const state = { clusters: initialClusters, loading: false, error: '' };
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
  };
  const api = { getOperationalClusters: jest.fn() };
  const coordinator = new OperationalQueueCoordinator(api, setters);
  coordinator.activate();
  return { state, setters, api, coordinator };
}

const response = (clusters: OperationalCluster[]) => ({ data: { data: clusters } });

describe('operational queue polling', () => {
  test('an unassigned alert remains unchanged until a poll confirms an assignment', async () => {
    const pendingPoll = deferred<ReturnType<typeof response>>();
    const assigned = { ...incident, status: 'dispatched' as const, assignedTeams: [{ id: 'team-1' }] };
    const { state, api, coordinator } = setup();
    api.getOperationalClusters.mockReturnValueOnce(pendingPoll.promise).mockResolvedValueOnce(response([assigned]));

    const firstPoll = coordinator.load();
    expect(state.clusters[0].assignedTeams).toEqual([]);
    pendingPoll.resolve(response([incident]));
    await firstPoll;
    expect(state.clusters[0].assignedTeams).toEqual([]);

    await coordinator.load();
    expect(state.clusters[0].assignedTeams).toEqual([{ id: 'team-1' }]);
    expect(state.clusters[0].status).toBe('dispatched');
    expect(api.getOperationalClusters).toHaveBeenCalledTimes(2);
    coordinator.dispose();
  });

  test('subsequent authoritative polls preserve assigned state', async () => {
    const assigned = { ...incident, status: 'responding' as const, assignedTeams: [{ id: 'team-1' }] };
    const { state, api, coordinator } = setup();
    api.getOperationalClusters.mockResolvedValue(response([assigned]));

    await coordinator.load();
    await coordinator.load();

    expect(state.clusters[0].assignedTeams).toEqual([{ id: 'team-1' }]);
    expect(state.clusters[0].status).toBe('responding');
    coordinator.dispose();
  });

  test('a later poll failure reports queue unavailability without fabricating assignment', async () => {
    const { state, api, coordinator } = setup();
    api.getOperationalClusters.mockRejectedValue(new Error('network failure'));

    await coordinator.load();

    expect(state.clusters[0].assignedTeams).toEqual([]);
    expect(state.error).toBe('Operational incidents could not be loaded.');
    expect(state.loading).toBe(false);
    coordinator.dispose();
  });

  test('a late older queue response cannot overwrite a newer request', async () => {
    const older = deferred<ReturnType<typeof response>>();
    const newer = deferred<ReturnType<typeof response>>();
    const { state, api, coordinator } = setup();
    api.getOperationalClusters.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);

    const oldRequest = coordinator.load();
    const newRequest = coordinator.load();
    const assigned = { ...incident, assignedTeams: [{ id: 'team-1' }] };
    newer.resolve(response([assigned]));
    await newRequest;
    older.resolve(response([incident]));
    await oldRequest;

    expect(state.clusters[0].assignedTeams).toEqual([{ id: 'team-1' }]);
    expect(state.loading).toBe(false);
    coordinator.dispose();
  });

  test('unmount during polling prevents later state updates', async () => {
    const poll = deferred<ReturnType<typeof response>>();
    const { setters, api, coordinator } = setup();
    api.getOperationalClusters.mockReturnValue(poll.promise);
    const loading = coordinator.load();
    const stateUpdateCounts = Object.values(setters).map(setter => setter.mock.calls.length);

    coordinator.dispose();
    poll.resolve(response([incident]));
    await loading;

    expect(Object.values(setters).map(setter => setter.mock.calls.length)).toEqual(stateUpdateCounts);
  });
});
