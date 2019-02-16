import React from 'react';
import { connect } from 'dva';
import Index from '../components/Index';

const IndexPage = ({ dispatch, user}) => {

    // function save(user) {
    //     dispatch({
    //         type: 'user/save',
    //         payload: {...user}
    //     })
    // }
    // function remove(user) {
    //     dispatch({
    //         type: 'user/remove',
    //     })
    // }

    function redirect(pathname) {
        dispatch({
            type: 'app/redirect',
            payload: {
                pathname
            }
        })
    }

    return (
        <Index user={user} />
    )
}
  
  // export default Products;
  export default connect(({ user }) => ({
    user,
  }))(IndexPage);