import {push} from 'connected-react-router';

export function getTasks(userToken,forceUpdate) {
    return (dispatch,getState) => {
        var {tasks} = getState();
        //利用缓存，forceUpdae:强制请求
        if(!forceUpdate && tasks) {
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
            dispatch({ type: 'saveTasks', tasks: data.data })
        }).catch(e => {
            dispatch({ type: 'removeUser' })
            if (e.message == 401) {
                this.props.history.push('/login');
            }
        })
    }
}
export function logout() {
    return (dispatch,getState) => {
        console.log('logout',getState());
        // dispatch({type:'removeUser'});
        // dispatch(push('/login'))
    }
}
export function redirect() {
    return (dispatch,getState) => {
        console.log('test',getState());
        // dispatch({type:'removeUser'});
        dispatch(push('/'))
    }
}