import {routerRedux} from 'dva/router'
export default {
    namespace: 'user',
    state: {},
    subscriptions: {
        // setup({ dispatch, history }) {  // eslint-disable-line
        // },
      },
    
      effects: {
          *watchUser({payload},{call,put,takeLatest}) {
            yield takeLatest('user/remove',function* (){
                yield put(routerRedux.push('/login'))
            })
          },
        *toLogin({ payload }, { call, put }) {  // eslint-disable-line
          yield put(routerRedux.push('/login'));
        },
      },
    
      reducers: {
          save(state,action) {
            sessionStorage.setItem('username',action.payload.username);
            sessionStorage.setItem('userToken',action.payload.userToken);
            return { 
                ...state,
                ...action.payload,
            }   
          },
          remove(state) {
              console.log('user to remove')
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