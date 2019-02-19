import { routerRedux } from 'dva/router'
export default {
    namespace: 'tasks',
    state: {
        list: [],
    },
    subscriptions: {
        // setup({ dispatch, history }) {  // eslint-disable-line
        // },
    },

    effects: {
        * getTasks({ payload }, { call, put }) {
            console.log('get tasks', payload)
            const { userToken } = payload;
            const p = function() {
               return fetch('http://localhost:8082/tasks', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${userToken}`
                    }
                }).then(res => {
                    if (res.status == 401) {
                        throw new Error(401)
                    }
                    return res.json()
                }).then(data => {
                    var handledTasks = data.data.map(task => {
                        // task.creatime = task.creatime ? Utils.dateFormat(new Date(task.creatime),'yyyy-MM-dd'): '';
                        // task.startime = task.startime ? Utils.dateFormat(new Date(task.startime),'yyyy-MM-dd') : '';
                        // task.endtime = task.endtime ? Utils.dateFormat(new Date(task.endtime),'yyyy-MM-dd') : '';
                        return task
                    })
                    return { code: 0, data: handledTasks };
                }).catch(e => {
                    if (e.message == 401) {
                        return { code: 401, data: [] }
                    } else {
                        console.error(e);
                        return { code: 999, data: [] }
                    }
                })
            }
            const res = yield call(p) // 执行p函数，返回值赋值给res
            if (res.code === 0) {
                // yield put({ // dispatch一个action到reducer， payload是请求返回的数据
                //     type: 'save',
                //     payload: { list: res.data }
                // })
            } else if (res.code === 401) {
                yield put({
                    type: 'user/remove'
                })
                // yield put(routerRedux.push('/login'))
            }

        }
    },

    reducers: {
        save(state, action) {
            console.log('task save', action)
            return {
                ...state,
                ...action.payload,
            }
        },
        update(state, action) {
            let index;
            let tasks = state.list || [];
            let task = tasks.filter((t, i) => {
                if (t.id === action.payload.newTask.id) {
                    index = i;
                    return true;
                }
            })[0];
            return {
                ...state,
                list: [
                    ...tasks.splice(0, index),
                    {
                        ...task,
                        ...action.payload.newTask
                    },
                    ...tasks.splice(index + 1)
                ]
            }
        },
        append(state, action) {
            let task = action.payload.task
            return {
                ...state,
                list: state.list.concat(task)
            }
        },
        delete(state, action) {
            let index;
            let tasks = state.list || [];
            tasks.filter((t, i) => {
                if (t.id === action.payload.delTask.id) {
                    index = i;
                    return true;
                }
            })[0];
            return {
                ...state,
                list: [
                    ...tasks.splice(0, index),
                    ...tasks.splice(index + 1)
                ]
            }
            return {
                ...state,
                list: [],
            }
        }
    },
};