import TeamManagement from '@/components/TeamManagement';
import teamService from '@/services/teamService';
import { collectElements, collectText, createHookHarness } from './support/tree';

let mockWidth = 320;
let mockHooks: ReturnType<typeof createHookHarness>;
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useState: (initial: unknown) => mockHooks.useState(initial),
  useEffect: jest.fn(),
  useCallback: (callback: unknown) => callback,
}));
jest.mock('react-native', () => ({
  Pressable: 'Pressable', Text: 'Text', View: 'View',
  Platform: { OS: 'web', select: (options: { web?: unknown; default?: unknown }) => options.web ?? options.default },
  StyleSheet: { create: (styles: unknown) => styles },
  useWindowDimensions: () => ({ width: mockWidth }),
}));
jest.mock('@/components/ui', () => ({
  Banner: 'Banner', Button: 'Button', Card: 'Card', Dialog: 'Dialog', EmptyState: 'EmptyState', ErrorState: 'ErrorState', Field: 'Field', Input: 'Input', LoadingState: 'LoadingState', PageHeader: 'PageHeader', Screen: 'Screen', StatusBadge: 'StatusBadge', TextArea: 'TextArea',
}));
jest.mock('@/services/teamService', () => ({ __esModule: true, default: { updateTeam: jest.fn().mockResolvedValue({}), removeTeamMember: jest.fn().mockResolvedValue({}), getAllTeams: jest.fn().mockResolvedValue([]) } }));
jest.mock('@/services/personnelService', () => ({ __esModule: true, default: { getRescueMembers: jest.fn().mockResolvedValue([]) } }));
jest.mock('@/utils/operations', () => ({ isTeamPresentationReady: () => true }));

const longName = 'BFP Responder E2E with a long but readable member name';
const longEmail = 'responder-with-an-extremely-long-email-address@response-team.example.test';
const team = {
  id: 'team-1', name: 'Response Team One', is_active: true, team_leader_id: 'leader-user', team_leader: { name: 'Team Leader One' },
  members: [
    { id: 'leader-member', user_id: 'leader-user', personnel_role: 'rescue_member', is_active: true, user: { name: 'Team Leader One' } },
    { id: 'responder-member', user_id: 'responder-user', personnel_role: 'rescue_member', is_active: true, user: { name: longName, email: longEmail, phone: '+63 912 345 6789' } },
  ],
};

const render = () => {
  mockHooks.resetCursor();
  return TeamManagement();
};
const buttons = (tree: unknown) => collectElements(tree).filter(element => element.type === 'Button');

describe('response team member presentation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWidth = 320;
    mockHooks = createHookHarness();
    mockHooks.slots.push([team], [], false, '', false, false, team.id, { name: '', description: '', teamLeaderId: '', selected: [] });
  });

  test.each([320, 360, 375, 390, 430, 768, 1280])('at %ipx names, email and phone retain their full identity column', width => {
    mockWidth = width;
    const tree = render();
    const member = collectElements(tree).find(element => element.key === 'responder-member')!;
    const styles = Object.assign({}, ...(member.props.style as object[]));
    expect(styles.flexDirection).toBe(width < 680 ? 'column' : 'row');
    const text = collectText(member).join(' ');
    expect(text).toContain(longName);
    expect(text).toContain(longEmail);
    expect(text).toContain('+63 912 345 6789');
    expect(buttons(tree).some(button => button.props.label === 'Remove' && button.props.variant === 'danger')).toBe(true);
    expect(buttons(tree).some(button => button.props.label === `Make team leader: ${longName}`)).toBe(true);
    expect(buttons(tree).some(button => button.props.label === 'Close management')).toBe(true);
  });

  test('the current leader has a readable badge and cannot be removed', () => {
    const tree = render();
    const leader = collectElements(tree).find(element => element.key === 'leader-member')!;
    expect(collectText(leader)).toContain('Team leader');
    expect(buttons(leader).some(button => button.props.label === 'Remove')).toBe(false);
  });

  test('make team leader retains the existing user-id update contract', async () => {
    const button = buttons(render()).find(element => element.props.label === `Make team leader: ${longName}`)!;
    await (button.props.onPress as () => void)();
    expect(teamService.updateTeam).toHaveBeenCalledWith('team-1', { teamLeaderId: 'responder-user' });
  });

  test('remove retains the existing team and membership identifiers', async () => {
    const button = buttons(render()).find(element => element.props.label === 'Remove')!;
    await (button.props.onPress as () => void)();
    expect(teamService.removeTeamMember).toHaveBeenCalledWith('team-1', 'responder-member');
  });
});
