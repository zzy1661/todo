import React from 'react'
import { Route, Switch, Redirect } from 'react-router-dom';

import Login from '../containers/Login';
import Index from '../containers/index';


const routes = (

    <Switch>
        <Route path="/login" component={Login} />
        <Redirect exact from="/" to="/general" />
        <Route path="/general" component={Index} />
        {/* <Route path="/workbench" component={Index}></Route>
        <Route path="/statistics" component={Index}></Route>
        <Redirect to="/login" /> */}
    </Switch>

)

export default routes
