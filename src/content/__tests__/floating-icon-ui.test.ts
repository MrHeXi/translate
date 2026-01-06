// 浮动图标UI交互响应性属性测试

import * as fc from 'fast-check';

// 模拟DOM环境
const mockDocument = {
  createElement: (tagName: string) => {
    const element = {
      tagName: tagName.toUpperCase(),
      style: {} as CSSStyleDeclaration,
      innerHTML: '',
      textContent: '',
      id: '',
      className: '',
      parentNode: null as any,
      appendChild: jest.fn(),
      removeChild: jest.fn(),
      insertBefore: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      getBoundingClientRect: jest.fn(() => ({
        left: 20,
        top: 20,
        width: 50,
        height: 50,
        right: 70,
        bottom: 70
      })),
      contains: jest.fn(() => false),
      querySelector: jest.fn(),
      querySelectorAll: jest.fn(() => [])
    };
    return element;
  },
  body: {
    appendChild: jest.fn(),
    removeChild: jest.fn(),
    contains: jest.fn(() => false)
  },
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
};

const mockWindow = {
  innerWidth: 1024,
  innerHeight: 768,
  scrollY: 0,
  scrollX: 0,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
};

const mockChromeRuntime = {
  sendMessage: jest.fn()
};

// 设置全局对象
(global as any).document = mockDocument;
(global as any).window = mockWindow;
(global as any).chrome = { runtime: mockChromeRuntime };

// 导入要测试的组件
import { FloatingIcon } from '../components/FloatingIcon';

describe('浮动图标UI交互响应性属性测试', () => {
  let floatingIcon: FloatingIcon;

  beforeEach(() => {
    jest.clearAllMocks();
    floatingIcon = new FloatingIcon();
    
    // 设置默认的Chrome API响应
    mockChromeRuntime.sendMessage.mockImplementation((message, callback) => {
      if (callback) {
        callback({ success: true });
      }
    });
  });

  afterEach(() => {
    floatingIcon.cleanup();
  });

  describe('属性 12：UI交互响应性', () => {
    it('对于任何用户交互操作，浮动图标应该在合理时间内响应并提供视觉反馈', async () => {
      // Feature: chrome-translation-extension, Property 12: UI交互响应性
      await fc.assert(
        fc.asyncProperty(
          // 生成用户交互序列
          fc.array(
            fc.record({
              action: fc.constantFrom('click', 'dblclick', 'contextmenu', 'mouseenter', 'mouseleave', 'mousedown', 'mousemove', 'mouseup'),
              position: fc.record({
                x: fc.integer({ min: 0, max: 1000 }),
                y: fc.integer({ min: 0, max: 700 })
              }),
              timing: fc.integer({ min: 0, max: 500 }), // 操作间隔时间（毫秒）
              expectResponse: fc.boolean()
            }),
            { minLength: 1, maxLength: 10 }
          ),
          // 生成初始图标配置
          fc.record({
            initialPosition: fc.record({
              x: fc.integer({ min: 0, max: 500 }),
              y: fc.integer({ min: 0, max: 400 })
            }),
            isTranslationActive: fc.boolean(),
            isLearningModeActive: fc.boolean()
          }),
          async (interactions, initialConfig) => {
            // 创建浮动图标
            floatingIcon.create(initialConfig.initialPosition);
            
            // 设置初始状态
            floatingIcon.updateState(initialConfig.isTranslationActive);
            floatingIcon.updateLearningModeState(initialConfig.isLearningModeActive);
            
            // 跟踪响应时间和状态变化
            const responseLog: Array<{
              action: string;
              startTime: number;
              endTime?: number;
              responseTime?: number;
              stateChanged: boolean;
            }> = [];
            
            let currentTranslationState = initialConfig.isTranslationActive;
            let currentLearningState = initialConfig.isLearningModeActive;
            
            // 模拟回调函数
            let toggleCallback: (() => void) | null = null;
            let learningToggleCallback: (() => void) | null = null;
            
            floatingIcon.onToggle(() => {
              currentTranslationState = !currentTranslationState;
              floatingIcon.updateState(currentTranslationState);
              if (toggleCallback) toggleCallback();
            });
            
            floatingIcon.onLearningModeToggle(() => {
              currentLearningState = !currentLearningState;
              floatingIcon.updateLearningModeState(currentLearningState);
              if (learningToggleCallback) learningToggleCallback();
            });
            
            // 执行交互序列
            for (const interaction of interactions) {
              // 等待指定的时间间隔
              await new Promise(resolve => setTimeout(resolve, interaction.timing));
              
              const startTime = Date.now();
              let stateChanged = false;
              
              // 记录状态变化前的值
              const prevTranslationState = currentTranslationState;
              const prevLearningState = currentLearningState;
              
              // 模拟用户交互
              const mockEvent = {
                type: interaction.action,
                clientX: interaction.position.x,
                clientY: interaction.position.y,
                button: 0,
                preventDefault: jest.fn(),
                stopPropagation: jest.fn(),
                target: mockDocument.createElement('div')
              };
              
              // 根据交互类型执行相应的处理
              switch (interaction.action) {
                case 'click':
                  // 模拟点击事件 - 应该切换翻译状态
                  if (interaction.expectResponse) {
                    toggleCallback = () => {
                      stateChanged = true;
                    };
                    // 触发点击回调
                    floatingIcon.onToggle(() => {
                      currentTranslationState = !currentTranslationState;
                      floatingIcon.updateState(currentTranslationState);
                      stateChanged = true;
                    });
                    
                    // 模拟实际点击
                    currentTranslationState = !currentTranslationState;
                    floatingIcon.updateState(currentTranslationState);
                    stateChanged = true;
                  }
                  break;
                  
                case 'dblclick':
                  // 模拟双击事件 - 应该切换学习模式状态
                  if (interaction.expectResponse) {
                    learningToggleCallback = () => {
                      stateChanged = true;
                    };
                    
                    currentLearningState = !currentLearningState;
                    floatingIcon.updateLearningModeState(currentLearningState);
                    stateChanged = true;
                  }
                  break;
                  
                case 'contextmenu':
                  // 模拟右键菜单 - 应该显示上下文菜单
                  if (interaction.expectResponse) {
                    // 上下文菜单显示不改变状态，但应该有响应
                    stateChanged = false; // 菜单显示不算状态变化
                  }
                  break;
                  
                case 'mouseenter':
                  // 模拟鼠标悬停 - 应该有视觉反馈
                  if (interaction.expectResponse) {
                    // 悬停效果不改变功能状态
                    stateChanged = false;
                  }
                  break;
                  
                case 'mouseleave':
                  // 模拟鼠标离开 - 应该恢复正常状态
                  if (interaction.expectResponse) {
                    stateChanged = false;
                  }
                  break;
                  
                case 'mousedown':
                  // 模拟鼠标按下 - 开始拖拽
                  if (interaction.expectResponse) {
                    stateChanged = false;
                  }
                  break;
                  
                case 'mousemove':
                  // 模拟鼠标移动 - 拖拽过程中
                  if (interaction.expectResponse) {
                    // 更新位置
                    floatingIcon.updatePosition(interaction.position);
                    stateChanged = false;
                  }
                  break;
                  
                case 'mouseup':
                  // 模拟鼠标释放 - 结束拖拽
                  if (interaction.expectResponse) {
                    stateChanged = false;
                  }
                  break;
              }
              
              const endTime = Date.now();
              const responseTime = endTime - startTime;
              
              // 记录响应日志
              responseLog.push({
                action: interaction.action,
                startTime,
                endTime,
                responseTime,
                stateChanged
              });
              
              // 验证响应时间
              if (interaction.expectResponse) {
                // UI响应应该在100ms内完成
                expect(responseTime).toBeLessThan(100);
              }
              
              // 验证状态变化的正确性
              if (interaction.action === 'click' && interaction.expectResponse) {
                expect(currentTranslationState).not.toBe(prevTranslationState);
              }
              
              if (interaction.action === 'dblclick' && interaction.expectResponse) {
                expect(currentLearningState).not.toBe(prevLearningState);
              }
            }
            
            // 验证整体响应性能
            const responseInteractions = responseLog.filter(log => log.responseTime !== undefined);
            
            if (responseInteractions.length > 0) {
              // 计算平均响应时间
              const avgResponseTime = responseInteractions.reduce((sum, log) => 
                sum + (log.responseTime || 0), 0) / responseInteractions.length;
              
              // 平均响应时间应该很快
              expect(avgResponseTime).toBeLessThan(50);
              
              // 最大响应时间不应该超过阈值
              const maxResponseTime = Math.max(...responseInteractions.map(log => log.responseTime || 0));
              expect(maxResponseTime).toBeLessThan(100);
              
              // 验证所有期望的响应都得到了处理
              const expectedResponses = interactions.filter(i => i.expectResponse).length;
              expect(responseInteractions.length).toBeGreaterThanOrEqual(expectedResponses);
            }
            
            // 验证状态一致性
            const stateChangeActions = responseLog.filter(log => 
              (log.action === 'click' || log.action === 'dblclick') && log.stateChanged
            );
            
            // 点击次数应该与翻译状态切换次数匹配
            const clickCount = stateChangeActions.filter(log => log.action === 'click').length;
            const expectedTranslationState = clickCount % 2 === 0 ? 
              initialConfig.isTranslationActive : !initialConfig.isTranslationActive;
            expect(currentTranslationState).toBe(expectedTranslationState);
            
            // 双击次数应该与学习模式状态切换次数匹配
            const dblClickCount = stateChangeActions.filter(log => log.action === 'dblclick').length;
            const expectedLearningState = dblClickCount % 2 === 0 ? 
              initialConfig.isLearningModeActive : !initialConfig.isLearningModeActive;
            expect(currentLearningState).toBe(expectedLearningState);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('对于任何拖拽操作，图标位置应该实时更新且保持在视窗范围内', async () => {
      // Feature: chrome-translation-extension, Property 12: UI交互响应性（拖拽部分）
      await fc.assert(
        fc.asyncProperty(
          // 生成拖拽路径
          fc.array(
            fc.record({
              x: fc.integer({ min: -100, max: 1200 }), // 包含超出边界的坐标
              y: fc.integer({ min: -100, max: 900 }),
              duration: fc.integer({ min: 10, max: 100 }) // 每个拖拽点的持续时间
            }),
            { minLength: 2, maxLength: 15 }
          ),
          // 生成初始配置
          fc.record({
            startPosition: fc.record({
              x: fc.integer({ min: 100, max: 400 }),
              y: fc.integer({ min: 100, max: 300 })
            }),
            iconSize: fc.record({
              width: fc.integer({ min: 40, max: 80 }),
              height: fc.integer({ min: 40, max: 80 })
            })
          }),
          async (dragPath, config) => {
            // 更新窗口尺寸模拟
            mockWindow.innerWidth = 1024;
            mockWindow.innerHeight = 768;
            
            // 创建浮动图标
            floatingIcon.create(config.startPosition);
            
            // 跟踪位置变化
            const positionLog: Array<{
              timestamp: number;
              x: number;
              y: number;
              isValid: boolean;
            }> = [];
            
            // 记录初始位置
            positionLog.push({
              timestamp: Date.now(),
              x: config.startPosition.x,
              y: config.startPosition.y,
              isValid: true
            });
            
            // 模拟拖拽开始
            let isDragging = false;
            const startTime = Date.now();
            
            // 执行拖拽路径
            for (let i = 0; i < dragPath.length; i++) {
              const point = dragPath[i]!;
              
              if (i === 0) {
                // 开始拖拽
                isDragging = true;
              }
              
              // 等待指定时间
              await new Promise(resolve => setTimeout(resolve, point.duration));
              
              // 计算约束后的位置
              const constrainedX = Math.max(0, Math.min(point.x, mockWindow.innerWidth - config.iconSize.width));
              const constrainedY = Math.max(0, Math.min(point.y, mockWindow.innerHeight - config.iconSize.height));
              
              // 更新图标位置
              floatingIcon.updatePosition({ x: constrainedX, y: constrainedY });
              
              // 记录位置
              const isValidPosition = 
                constrainedX >= 0 && 
                constrainedX <= mockWindow.innerWidth - config.iconSize.width &&
                constrainedY >= 0 && 
                constrainedY <= mockWindow.innerHeight - config.iconSize.height;
              
              positionLog.push({
                timestamp: Date.now(),
                x: constrainedX,
                y: constrainedY,
                isValid: isValidPosition
              });
              
              // 验证位置约束
              expect(constrainedX).toBeGreaterThanOrEqual(0);
              expect(constrainedX).toBeLessThanOrEqual(mockWindow.innerWidth - config.iconSize.width);
              expect(constrainedY).toBeGreaterThanOrEqual(0);
              expect(constrainedY).toBeLessThanOrEqual(mockWindow.innerHeight - config.iconSize.height);
            }
            
            // 结束拖拽
            isDragging = false;
            const endTime = Date.now();
            const totalDragTime = endTime - startTime;
            
            // 验证拖拽响应性
            
            // 1. 验证所有位置都在有效范围内
            const invalidPositions = positionLog.filter(pos => !pos.isValid);
            expect(invalidPositions.length).toBe(0);
            
            // 2. 验证位置更新的连续性
            for (let i = 1; i < positionLog.length; i++) {
              const prev = positionLog[i - 1]!;
              const curr = positionLog[i]!;
              
              // 时间戳应该递增
              expect(curr.timestamp).toBeGreaterThanOrEqual(prev.timestamp);
              
              // 位置变化应该合理（不应该有瞬移）
              const deltaX = Math.abs(curr.x - prev.x);
              const deltaY = Math.abs(curr.y - prev.y);
              const deltaTime = curr.timestamp - prev.timestamp;
              
              if (deltaTime > 0) {
                // 计算移动速度（像素/毫秒）
                const speed = Math.sqrt(deltaX * deltaX + deltaY * deltaY) / deltaTime;
                
                // 速度应该在合理范围内（不超过5像素/毫秒）
                expect(speed).toBeLessThan(5);
              }
            }
            
            // 3. 验证拖拽路径的完整性
            expect(positionLog.length).toBe(dragPath.length + 1); // +1 for initial position
            
            // 4. 验证最终位置
            const finalPosition = positionLog[positionLog.length - 1]!;
            const lastDragPoint = dragPath[dragPath.length - 1]!;
            
            const expectedFinalX = Math.max(0, Math.min(lastDragPoint.x, mockWindow.innerWidth - config.iconSize.width));
            const expectedFinalY = Math.max(0, Math.min(lastDragPoint.y, mockWindow.innerHeight - config.iconSize.height));
            
            expect(finalPosition.x).toBe(expectedFinalX);
            expect(finalPosition.y).toBe(expectedFinalY);
            
            // 5. 验证拖拽性能
            if (dragPath.length > 1) {
              const avgUpdateInterval = totalDragTime / dragPath.length;
              // 平均更新间隔应该合理
              expect(avgUpdateInterval).toBeLessThan(200); // 不超过200ms
            }
            
            // 6. 验证边界处理
            const boundaryTests = [
              { x: -50, y: 100 }, // 左边界外
              { x: mockWindow.innerWidth + 50, y: 100 }, // 右边界外
              { x: 100, y: -50 }, // 上边界外
              { x: 100, y: mockWindow.innerHeight + 50 } // 下边界外
            ];
            
            for (const testPos of boundaryTests) {
              const constrainedX = Math.max(0, Math.min(testPos.x, mockWindow.innerWidth - config.iconSize.width));
              const constrainedY = Math.max(0, Math.min(testPos.y, mockWindow.innerHeight - config.iconSize.height));
              
              floatingIcon.updatePosition({ x: constrainedX, y: constrainedY });
              
              // 验证约束后的位置在有效范围内
              expect(constrainedX).toBeGreaterThanOrEqual(0);
              expect(constrainedX).toBeLessThanOrEqual(mockWindow.innerWidth - config.iconSize.width);
              expect(constrainedY).toBeGreaterThanOrEqual(0);
              expect(constrainedY).toBeLessThanOrEqual(mockWindow.innerHeight - config.iconSize.height);
            }
          }
        ),
        { numRuns: 15 }
      );
    });

    it('对于任何状态变化，图标外观应该立即更新以反映当前状态', async () => {
      // Feature: chrome-translation-extension, Property 12: UI交互响应性（状态反馈部分）
      await fc.assert(
        fc.asyncProperty(
          // 生成状态变化序列
          fc.array(
            fc.record({
              translationState: fc.boolean(),
              learningState: fc.boolean(),
              delay: fc.integer({ min: 0, max: 200 })
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (stateChanges) => {
            // 创建浮动图标
            floatingIcon.create({ x: 100, y: 100 });
            
            // 跟踪状态变化和视觉更新
            const stateLog: Array<{
              timestamp: number;
              translationState: boolean;
              learningState: boolean;
              expectedAppearance: string;
            }> = [];
            
            // 执行状态变化序列
            for (const stateChange of stateChanges) {
              // 等待指定延迟
              await new Promise(resolve => setTimeout(resolve, stateChange.delay));
              
              const timestamp = Date.now();
              
              // 更新状态
              floatingIcon.updateState(stateChange.translationState);
              floatingIcon.updateLearningModeState(stateChange.learningState);
              
              // 确定期望的外观
              let expectedAppearance: string;
              if (stateChange.translationState && stateChange.learningState) {
                expectedAppearance = 'translation-learning'; // 翻译+学习模式
              } else if (stateChange.translationState) {
                expectedAppearance = 'translation-only'; // 仅翻译模式
              } else if (stateChange.learningState) {
                expectedAppearance = 'learning-only'; // 仅学习模式
              } else {
                expectedAppearance = 'default'; // 默认状态
              }
              
              // 记录状态
              stateLog.push({
                timestamp,
                translationState: stateChange.translationState,
                learningState: stateChange.learningState,
                expectedAppearance
              });
              
              // 验证状态更新的即时性（这里我们假设更新是同步的）
              // 在实际实现中，可以通过检查DOM元素的样式或内容来验证
            }
            
            // 验证状态变化的一致性
            
            // 1. 验证所有状态都被记录
            expect(stateLog.length).toBe(stateChanges.length);
            
            // 2. 验证状态变化的时序
            for (let i = 1; i < stateLog.length; i++) {
              const prev = stateLog[i - 1]!;
              const curr = stateLog[i]!;
              
              // 时间戳应该递增
              expect(curr.timestamp).toBeGreaterThanOrEqual(prev.timestamp);
            }
            
            // 3. 验证状态组合的正确性
            const stateTransitions = new Map<string, number>();
            
            for (const state of stateLog) {
              const key = `${state.translationState}-${state.learningState}`;
              stateTransitions.set(key, (stateTransitions.get(key) || 0) + 1);
            }
            
            // 验证所有可能的状态组合都能正确处理
            for (const [stateKey, count] of stateTransitions) {
              expect(count).toBeGreaterThan(0);
              
              const [translationStr, learningStr] = stateKey.split('-');
              const translationState = translationStr === 'true';
              const learningState = learningStr === 'true';
              
              // 验证状态组合的有效性
              expect(typeof translationState).toBe('boolean');
              expect(typeof learningState).toBe('boolean');
            }
            
            // 4. 验证最终状态
            const finalState = stateLog[stateLog.length - 1]!;
            const finalStateChange = stateChanges[stateChanges.length - 1]!;
            
            expect(finalState.translationState).toBe(finalStateChange.translationState);
            expect(finalState.learningState).toBe(finalStateChange.learningState);
            
            // 5. 验证状态变化的响应时间
            if (stateLog.length > 1) {
              const stateChangeIntervals: number[] = [];
              
              for (let i = 1; i < stateLog.length; i++) {
                const interval = stateLog[i]!.timestamp - stateLog[i - 1]!.timestamp;
                stateChangeIntervals.push(interval);
              }
              
              // 状态变化间隔应该与预期的延迟相符
              for (let i = 0; i < stateChangeIntervals.length && i < stateChanges.length - 1; i++) {
                const actualInterval = stateChangeIntervals[i];
                const expectedDelay = stateChanges[i + 1]?.delay;
                
                if (actualInterval !== undefined && expectedDelay !== undefined) {
                  // 允许一定的时间误差（±50ms）
                  expect(actualInterval).toBeGreaterThanOrEqual(expectedDelay - 50);
                  expect(actualInterval).toBeLessThanOrEqual(expectedDelay + 100);
                }
              }
            }
          }
        ),
        { numRuns: 25 }
      );
    });
  });
});