import React, { Component } from 'react';
import { connect } from 'dva';
import Index from '../components/Index';
import GeneralPage from './GeneralPage';
import WorkbenchPage from './WorkbenchPage'
import { Route, Link, Switch, Redirect, withRouter } from 'dva/router';

// const IndexPage = ({ dispatch, user}) => {
class IndexPage extends Component {

    componentDidMount() {
        console.log('index page mounted',this.props)
        const { dispatch, user} = this.props;
        dispatch({
            type: 'user/watchUser',
        })
        dispatch({
            type:'tasks/getTasks',
            payload: {
                userToken: user.userToken
            }
        })
    }
    removeUser = () => {
        const {dispatch} = this.props;
        dispatch({
            type: 'user/remove'
        })
    }
    render() {
    return (
        <Index user={this.props.user} removeUser={this.removeUser}> 
            <Switch>
                <Route path="/general" component={GeneralPage} />
                <Route path="/workbench" component={WorkbenchPage} />
                {/* <Route path="/statistics" component={Statistics} /> */}
            </Switch>
        </Index>
    )}
}
  
  // export default Products;
  export default connect(({ user }) => ({
    user,
  }))(IndexPage);