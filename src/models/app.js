export default {

    namespace: 'app',

    state: {},

    subscriptions: {
        // setup({ dispatch, history }) {  // eslint-disable-line
        // },
    },

    effects: {
        // *fetch({ payload }, { call, put }) {  // eslint-disable-line
        //   yield put({ type: 'save' });
        // },
        // 路由跳转
        // * redirect({ payload }, { put }) {
        //     yield put(routerRedux.push(payload.pathname));
        // },
    },

    reducers: {
        save(state, action) {
            return { ...state, ...action.payload };
        },
    },

};