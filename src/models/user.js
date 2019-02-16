export default {
    namespace: 'user',
    state: {},
    subscriptions: {
        // setup({ dispatch, history }) {  // eslint-disable-line
        // },
      },
    
      effects: {
        // *fetch({ payload }, { call, put }) {  // eslint-disable-line
        //   yield put({ type: 'save' });
        // },
      },
    
      reducers: {
          save(state,action) {
            sessionStorage.setItem('username',action.username);
            sessionStorage.setItem('userToken',action.userToken);
            return { 
                ...state,
                ...action.payload,
                // username: action.username,
                // userToken: action.userToken
            }   
          },
          remove(state,action) {
            sessionStorage.removeItem('username');
            sessionStorage.removeItem('userToken');
            return { 
                ...state,
                username: '',
                userToken: ''
            }
          }
      },
  };