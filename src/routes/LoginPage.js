import React from 'react';
import { connect } from 'dva';
import Login from '../components/Login';

const LoginPage = (props) => {
    const { dispatch, user} = props
    function save(user) {
        dispatch({
            type: 'user/save',
            payload: {...user}
        })
    }
    function remove(user) {
        dispatch({
            type: 'user/remove',
        })
    }
    return (
        <Login saveUser={save} removeUser={remove} user={user} />
    )
}

  
  // export default Products;
  export default connect(({ user }) => ({
    user,
  }))(LoginPage);