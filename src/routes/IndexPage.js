import React from 'react';
import { connect } from 'dva';
import Index from '../components/Index';
import GeneralPage from './GeneralPage';
import WorkbenchPage from './WorkbenchPage'
import { Route, Link, Switch, Redirect, withRouter } from 'dva/router';

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
        <Index user={user} > 
            <Switch>
                <Route path="/general" component={GeneralPage} />
                <Route path="/workbench" component={WorkbenchPage} />
                {/* <Route path="/statistics" component={Statistics} /> */}
            </Switch>
        </Index>
    )
}
  
  // export default Products;
  export default connect(({ user }) => ({
    user,
  }))(IndexPage);