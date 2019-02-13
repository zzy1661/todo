import { push } from 'connected-react-router';
import Utils from '../lib/utils';

export function getTasks(userToken, forceUpdate) {
    return (dispatch, getState) => {
        var {
            tasks
        } = getState();
        //利用缓存，forceUpdae:强制请求
        if (!forceUpdate && tasks) {
            return;
        }
        fetch('http://localhost:8082/tasks', {
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
                task.creatime = task.creatime ? Utils.dateFormat(new Date(task.creatime),'yyyy-MM-dd'): '';
                task.startime = task.startime ? Utils.dateFormat(new Date(task.startime),'yyyy-MM-dd') : '';
                task.endtime = task.endtime ? Utils.dateFormat(new Date(task.endtime),'yyyy-MM-dd') : '';
                return task
            })
            dispatch({
                type: 'SAVETASKS',
                tasks: handledTasks
            });
        }).catch(e => {
            if (e.message == 401) {
                dispatch(logout())
            } else {
                console.error(e);
            }


        })
    }
}
/* export function getTaskById(id) {
    console.log('id',id)
    return (dispatch,getState) => {
        var user = getState();
        if (!user.username || !user.userToken) {
            dispatch(logout())
            return;
          }
          fetch('http://localhost:8082/tasks', {
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
                task.creatime = task.creatime ? Utils.dateFormat(new Date(task.creatime)) : '';
                task.endtime = task.endtime ? Utils.dateFormat(new Date(task.endtime)) : '';
                return task
            })
            dispatch({
                type: 'SAVETASKS',
                tasks: handledTasks
            });
        }).catch(e => {
            dispatch(logout())
           
        })
    }

} */

export function logout() {
    return (dispatch, getState) => {
        dispatch({
            type: 'REMOVEUSER'
        });
        dispatch(push('/login'))
    }
}
export function login(username, userToken) {
    return (dispatch, getState) => {
        dispatch({
            type: 'SAVEUSER',
            username,
            userToken
        })
        dispatch(push('/general/all'))
    }
}