import React, { ComponentClass } from 'react';
import { SELECT_STORY, SET_STORIES, STORY_RENDERED } from '@storybook/core-events';
import { API } from '@storybook/api';
import { initCreeveyClientApi, CreeveyClientApi } from '../utils/creeveyClientApi';
import { Test, isDefined, CreeveyStatus, CreeveyUpdate, SetStoriesData, StoriesRaw, TestStatus } from '../types';
import { produce } from 'immer';
import { CreeveyContext } from './CreeveyContext';
import { getEmogyByTestStatus } from './Addon';

export interface CreeveyTestsProviderProps {
  active?: boolean;
  api: API;
}

export interface CreeveyTestsProviderState {
  status: CreeveyStatus;
  storyId: string;
  stories?: StoriesRaw;
  isRunning: boolean;
}
interface ChildProps extends CreeveyTestsProviderProps {
  statuses: Test[];
}

export function withCreeveyTests(
  Child: React.ComponentType<ChildProps>,
): ComponentClass<CreeveyTestsProviderProps, CreeveyTestsProviderState> {
  return class extends React.Component<CreeveyTestsProviderProps, CreeveyTestsProviderState> {
    static displayName = `withCreeveyTests(${Child.displayName || Child.name})`;
    creeveyApi: CreeveyClientApi | undefined;
    state: CreeveyTestsProviderState = {
      status: { isRunning: false, tests: {} },
      storyId: '',
      isRunning: false,
    };

    componentDidUpdate(_: CreeveyTestsProviderProps, prevState: CreeveyTestsProviderState): void {
      if (prevState.stories != this.state.stories && this.state.stories) {
        void this.props.api.setStories(this.state.stories);
      }
    }

    async componentDidMount(): Promise<void> {
      const { api } = this.props;
      this.creeveyApi = await initCreeveyClientApi();
      const status = await this.creeveyApi.status;
      this.setState({
        status: status,
      });
      this.creeveyApi?.onUpdate(({ tests, removedTests = [], isRunning }: CreeveyUpdate) => {
        if (isDefined(isRunning)) {
          this.setState({ isRunning });
        }
        if (isDefined(tests)) {
          this.setState(
            produce((draft: CreeveyTestsProviderState) => {
              const prevTests = draft.status.tests;
              const prevStories = draft.stories || {};
              Object.entries(tests).forEach(([id, update]) => {
                if (!prevTests[id]) {
                  prevTests[id] = { id: id, path: update?.path ?? [], skip: update?.skip ?? false };
                }
                let test = prevTests[id];
                if (test && removedTests.includes(test.path)) {
                  test = undefined;
                  return;
                }
                if (!update || !test) return;
                const { skip, status, results, approved } = update;
                const story = prevStories[test.storyId || ''];
                if (isDefined(skip)) test.skip = skip;
                if (isDefined(status)) {
                  test.status = status;
                  story.name = this.addStatus(story.name, status, skip || false);
                }
                if (isDefined(results)) test.results ? test.results.push(...results) : (test.results = results);
                if (isDefined(approved)) {
                  Object.entries(approved).forEach(
                    ([image, retry]) =>
                      retry !== undefined && test && ((test.approved = test?.approved || {})[image] = retry),
                  );
                }
              });
            }),
          );
        }
      }),
        api.on(STORY_RENDERED, this.onStoryRendered);
      api.on(SET_STORIES, this.addStatusesToSidebar);
      api.on(SELECT_STORY, this.onSelectStory);
    }

    componentWillUnmount(): void {
      const { api } = this.props;
      api.off(STORY_RENDERED, this.onStoryRendered);
      api.off(SET_STORIES, this.addStatusesToSidebar);
      api.off(SELECT_STORY, this.onSelectStory);
    }
    addStatusesToSidebar = ({ stories }: SetStoriesData): void => {
      this.setState({ stories: stories });
      Object.keys(stories).forEach((storyId) => {
        const status = this.getStoryStatus(storyId)[0];
        stories[storyId].name = this.addStatus(stories[storyId].name, status.status, status.skip);
      });
      void this.props.api.setStories(stories);
    };

    addStatus(name: string, status: TestStatus | undefined, skip: string | boolean): string {
      name = name.replace(/^(❌|✔|🟡|🕗|⏸) /, '');
      return `${getEmogyByTestStatus(status, skip)} ${name}`;
    }

    onSelectStory = (): void => {
      if (this.state.isRunning) {
        this.setState({ isRunning: false });
      }
    };

    onStoryRendered = (storyId: string): void => {
      this.setState({ storyId: storyId });
    };

    getStoryStatus = (storyId: string): Test[] => {
      const { status } = this.state;
      if (!status || !status.tests) return [];
      return Object.values(status.tests)
        .filter((result) => result?.storyId === storyId)
        .filter(isDefined);
    };

    handleImageApprove = (id: string, retry: number, image: string): void => this.creeveyApi?.approve(id, retry, image);

    handleStart = (ids: string[]): void => this.creeveyApi?.start(ids);
    handleStop = (): void => this.creeveyApi?.stop();
    render(): JSX.Element | null {
      return this.props.active ? (
        <CreeveyContext.Provider
          value={{
            isRunning: this.state.isRunning,
            onStart: this.handleStart,
            onStop: this.handleStop,
            onImageApprove: this.handleImageApprove,
          }}
        >
          <Child statuses={this.getStoryStatus(this.state.storyId)} {...this.props} />
        </CreeveyContext.Provider>
      ) : null;
    }
  };
}
